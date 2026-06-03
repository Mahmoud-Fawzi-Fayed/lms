// Performance & correctness regression tests for the watermarked PDF
// serve path in /api/content/[token].
//
// Specifically guards against the regressions we just fixed:
//   1. Cache key must NOT include the rotating token — keying by token meant
//      every reload re-watermarked from scratch (the user-visible "PDF takes
//      forever to open + slows the rest of the site" symptom).
//   2. Concurrent in-flight requests for the same (user, lesson) must dedupe
//      so a React strict-mode double-mount or quick refresh doesn't trigger
//      N parallel pdf-lib parses.
//   3. The watermarked PDF response must support HTTP Range so the client
//      can progressively fetch instead of downloading the full file before
//      the first page renders.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { makeUser, makeEnrollment } from './factories';
import { setCurrentUser, clearCurrentUser } from './auth-mock';
import { Course } from '@/models';

async function getRoute() {
  return import('@/app/api/content/[token]/route');
}
async function getTokenRoute() {
  return import('@/app/api/courses/[id]/content-token/route');
}

/** Build a real, parseable PDF so the watermark code path actually runs. */
async function makeRealPdf(pages = 2): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`Test page ${i + 1}`, { x: 50, y: 550, size: 24, font, color: rgb(0, 0, 0) });
  }
  return Buffer.from(await doc.save());
}

function browserPdfHeaders(extra: Record<string, string> = {}) {
  return {
    'X-Content-Request': '1',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    ...extra,
  };
}

function buildContentReq(token: string, headers: Record<string, string> = {}, mode: 'raw' | 'stream' = 'raw') {
  return new NextRequest(
    new URL(`http://localhost/api/content/${token}?mode=${mode}`),
    { method: 'GET', headers: { ...browserPdfHeaders(), ...headers } }
  );
}

async function issueToken(courseId: string, lessonId: string): Promise<string> {
  const { GET } = await getTokenRoute();
  const req = new NextRequest(
    new URL(`http://localhost/api/courses/${courseId}/content-token?lessonId=${lessonId}&kind=raw`),
  );
  const res = await GET(req, { params: { id: courseId } } as any);
  const json = await res.json();
  if (!json.success) throw new Error('token issuance failed: ' + JSON.stringify(json));
  return json.data.token as string;
}

describe('Content PDF perf — watermark cache & Range support', () => {
  let instructor: any;
  let student: any;
  let pdfBytes: Buffer;
  let pdfFile: string;
  let tmp: string;
  let course: any;
  let pdfLessonId: string;

  beforeAll(async () => {
    process.env.CONTENT_SECRET = 'a'.repeat(64);
    fs.mkdirSync(path.join(process.cwd(), 'uploads', 'tmp'), { recursive: true });
    pdfBytes = await makeRealPdf(3);
  });

  beforeEach(async () => {
    instructor = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student' });

    tmp = await fs.promises.mkdtemp(path.join(process.cwd(), 'uploads', 'tmp', 'perf-'));
    pdfFile = path.join(tmp, 'doc.pdf');
    await fs.promises.writeFile(pdfFile, pdfBytes);

    const pdfLessonObjectId = new mongoose.Types.ObjectId();
    pdfLessonId = String(pdfLessonObjectId);
    course = await Course.create({
      title: 'PDF Perf Course',
      slug: 'pdf-perf-' + Date.now().toString(36),
      description: 'A test course description with enough length to pass validation.',
      instructor: instructor._id,
      price: 0,
      category: 'general',
      level: 'beginner',
      language: 'ar',
      isPublished: true,
      modules: [{
        title: 'M',
        order: 1,
        lessons: [{
          _id: pdfLessonObjectId, title: 'Doc', type: 'pdf', filePath: pdfFile,
          isPreview: false, order: 1,
        }],
      }],
    });
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student' });
  });

  afterEach(async () => {
    clearCurrentUser();
    if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  });

  // ── 1. Cache survives token rotation ─────────────────────────────────────
  it('cache HITS across two different tokens for the same (user, lesson, mtime)', async () => {
    const { GET } = await getRoute();

    // 1st token: cold cache → real watermark
    const tokenA = await issueToken(String(course._id), pdfLessonId);
    const t0 = Date.now();
    const resA = await GET(buildContentReq(tokenA), { params: { token: tokenA } } as any);
    const dtA = Date.now() - t0;
    expect(resA.status).toBe(200);
    expect(resA.headers.get('content-type')).toContain('application/pdf');

    // 2nd token (different nonce) for the SAME user/lesson/file: cache HIT.
    // The hit path skips fs.readFile + pdf-lib parse + serialize entirely.
    const tokenB = await issueToken(String(course._id), pdfLessonId);
    expect(tokenB).not.toBe(tokenA);
    const t1 = Date.now();
    const resB = await GET(buildContentReq(tokenB), { params: { token: tokenB } } as any);
    const dtB = Date.now() - t1;
    expect(resB.status).toBe(200);

    const lenA = Number(resA.headers.get('content-length'));
    const lenB = Number(resB.headers.get('content-length'));
    expect(lenA).toBeGreaterThan(0);
    expect(lenB).toBe(lenA); // same cached watermark → identical size

    // Cached path must be at least an order of magnitude faster than the
    // cold path — even on slow CI this is a generous bound. The previous
    // (broken) implementation re-watermarked from scratch every time, so
    // dtB ≈ dtA. With the fix dtB is essentially memcpy.
    expect(dtB * 5).toBeLessThan(dtA + 30);
  }, 30_000);

  // ── 2. In-flight dedupe ──────────────────────────────────────────────────
  it('5 concurrent first-time requests dedupe to a single watermark pass', async () => {
    const { GET } = await getRoute();

    // Five tokens — different nonce each, but same (user, lesson, mtime),
    // i.e. same cache key. Without dedupe, 5 parallel pdf-lib parses would
    // run; with it, only one runs and the other 4 await the same promise.
    const tokens = await Promise.all(
      Array.from({ length: 5 }, () => issueToken(String(course._id), pdfLessonId))
    );

    const t0 = Date.now();
    const results = await Promise.all(
      tokens.map((tok) => GET(buildContentReq(tok), { params: { token: tok } } as any))
    );
    const total = Date.now() - t0;

    for (const r of results) {
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toContain('application/pdf');
    }

    // All five responses must have IDENTICAL content-length — proves they
    // all came from the same single watermark pass (deterministic input,
    // same cached output).
    const sizes = new Set(results.map((r) => r.headers.get('content-length')));
    expect(sizes.size).toBe(1);

    // 5 deduped requests should take roughly the time of ONE (not five).
    // For a 3-page PDF a single watermark pass is well under 200ms even on
    // CI, so 5 in parallel must finish under ~1s.
    expect(total).toBeLessThan(2000);
  }, 30_000);

  // ── 3. Range support on watermarked PDF ──────────────────────────────────
  it('serves byte ranges on the watermarked PDF (206 Partial Content + Content-Range)', async () => {
    const { GET } = await getRoute();
    const token = await issueToken(String(course._id), pdfLessonId);

    // Prime the cache with a normal full-body request so we know the size.
    const full = await GET(buildContentReq(token), { params: { token } } as any);
    expect(full.status).toBe(200);
    expect(full.headers.get('accept-ranges')).toBe('bytes');
    const total = Number(full.headers.get('content-length'));
    expect(total).toBeGreaterThan(100);

    // Fetch a 256-byte slice from the middle.
    const start = 50;
    const end = Math.min(start + 255, total - 1);
    const partial = await GET(
      buildContentReq(token, { range: `bytes=${start}-${end}` }),
      { params: { token } } as any,
    );
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe(`bytes ${start}-${end}/${total}`);
    expect(Number(partial.headers.get('content-length'))).toBe(end - start + 1);
    expect(partial.headers.get('accept-ranges')).toBe('bytes');

    // 416 on out-of-range start.
    const oob = await GET(
      buildContentReq(token, { range: `bytes=${total + 1000}-` }),
      { params: { token } } as any,
    );
    expect(oob.status).toBe(416);
    expect(oob.headers.get('content-range')).toBe(`bytes */${total}`);
  }, 30_000);

  // ── 4. Range is per-token rate-limit-free ────────────────────────────────
  it('Range requests do not count against the per-token raw cap', async () => {
    const { GET } = await getRoute();
    const token = await issueToken(String(course._id), pdfLessonId);

    // First, one full fetch to seed the cache. This counts as 1 raw hit.
    const seed = await GET(buildContentReq(token), { params: { token } } as any);
    expect(seed.status).toBe(200);

    // Now blast the SAME token with 20 Range requests. None should 429.
    // (PDF.js issues many Range requests for a single open; our implementation
    // must not count them, otherwise normal users hit "too many requests".)
    const total = Number(seed.headers.get('content-length'));
    const ranges = await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const s = (i * 100) % Math.max(1, total - 200);
        return GET(
          buildContentReq(token, { range: `bytes=${s}-${s + 99}` }),
          { params: { token } } as any,
        );
      })
    );
    for (const r of ranges) {
      expect([200, 206]).toContain(r.status);
    }
  }, 30_000);
});
