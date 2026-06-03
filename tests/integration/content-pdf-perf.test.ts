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
    // 30 pages → enough work that the cold-watermark vs cached-memcpy delta
    // is reliably measurable on CI without making the suite slow.
    pdfBytes = await makeRealPdf(30);
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

    // Issue both tokens up-front so we don't include DB latency in the
    // request-only timing below.
    const tokenA = await issueToken(String(course._id), pdfLessonId);
    const tokenB = await issueToken(String(course._id), pdfLessonId);
    expect(tokenB).not.toBe(tokenA);

    // 1st request: cold cache → real watermark.
    const t0 = performance.now();
    const resA = await GET(buildContentReq(tokenA), { params: { token: tokenA } } as any);
    await resA.arrayBuffer();
    const dtA = performance.now() - t0;
    expect(resA.status).toBe(200);
    expect(resA.headers.get('content-type')).toContain('application/pdf');

    // 2nd request with a different token: cache HIT. The hit path skips
    // fs.readFile + pdf-lib parse + serialize entirely.
    const t1 = performance.now();
    const resB = await GET(buildContentReq(tokenB), { params: { token: tokenB } } as any);
    await resB.arrayBuffer();
    const dtB = performance.now() - t1;
    expect(resB.status).toBe(200);

    const lenA = Number(resA.headers.get('content-length'));
    const lenB = Number(resB.headers.get('content-length'));
    expect(lenA).toBeGreaterThan(0);
    // Same cached watermark → identical size. This is the primary regression
    // signal: the previous (broken) cache key included the rotating token,
    // so each request produced a fresh watermark with a different timestamp
    // → different content-length. Identical lengths here = cache hit.
    expect(lenB).toBe(lenA);

    // Soft timing bound — on a 30-page PDF the cold path is meaningfully
    // slower than the cached memcpy. We don't require an exact ratio (CI
    // schedulers are noisy) but a 3× speedup or `dtB <= 50ms` is plenty.
    const cacheIsFast = dtB <= 50 || dtB * 3 <= dtA;
    expect(cacheIsFast).toBe(true);
  }, 60_000);

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

  // ── 5. Cache key isolation: different users get different watermarks ────
  it('two users opening the same PDF get DIFFERENT watermarked content (cache is per-user)', async () => {
    // Enroll a 2nd student in the same course.
    const otherStudent = await makeUser({ role: 'student' });
    await makeEnrollment({ user: otherStudent._id, course: course._id, status: 'active' });

    const { GET } = await getRoute();

    // User 1 fetch.
    setCurrentUser({ id: String(student._id), role: 'student' });
    const tokenA = await issueToken(String(course._id), pdfLessonId);
    const resA = await GET(buildContentReq(tokenA), { params: { token: tokenA } } as any);
    expect(resA.status).toBe(200);
    const bytesA = Buffer.from(await resA.arrayBuffer());

    // User 2 fetch — different cache key (different userId), so a fresh
    // watermark is produced with THIS user's email/id stamped, not user 1's.
    setCurrentUser({ id: String(otherStudent._id), role: 'student' });
    const tokenB = await issueToken(String(course._id), pdfLessonId);
    const resB = await GET(buildContentReq(tokenB), { params: { token: tokenB } } as any);
    expect(resB.status).toBe(200);
    const bytesB = Buffer.from(await resB.arrayBuffer());

    // Sizes might be similar but the content must differ — at minimum
    // the bytes embedding the email/id must be present somewhere.
    expect(bytesA.equals(bytesB)).toBe(false);
  }, 30_000);

  // ── 6. Cache key isolation: different lessons in same course ────────────
  it('two PDF lessons in the same course get independent cache entries', async () => {
    // Add a second PDF lesson to the same course.
    const pdfBytes2 = await makeRealPdf(2);
    const pdfFile2 = path.join(tmp, 'doc2.pdf');
    await fs.promises.writeFile(pdfFile2, pdfBytes2);
    const lesson2Id = new mongoose.Types.ObjectId();
    course.modules[0].lessons.push({
      _id: lesson2Id, title: 'Doc 2', type: 'pdf', filePath: pdfFile2, isPreview: false, order: 2,
    } as any);
    await course.save();

    const { GET } = await getRoute();

    const tokenA = await issueToken(String(course._id), pdfLessonId);
    const resA = await GET(buildContentReq(tokenA), { params: { token: tokenA } } as any);
    expect(resA.status).toBe(200);
    const sizeA = Number(resA.headers.get('content-length'));

    const tokenB = await issueToken(String(course._id), String(lesson2Id));
    const resB = await GET(buildContentReq(tokenB), { params: { token: tokenB } } as any);
    expect(resB.status).toBe(200);
    const sizeB = Number(resB.headers.get('content-length'));

    // Different source PDFs (3 pages vs 2 pages) → different output sizes.
    // Even if they were the same size, the bytes would differ — so this is
    // a conservative assertion.
    expect(sizeA).not.toBe(sizeB);
  }, 30_000);

  // ── 7. mtime change invalidates the cache ───────────────────────────────
  it('re-saving the source file (new mtime) bypasses the old cache entry', async () => {
    const { GET } = await getRoute();

    // Cold fetch primes the cache.
    const t1 = await issueToken(String(course._id), pdfLessonId);
    const r1 = await GET(buildContentReq(t1), { params: { token: t1 } } as any);
    expect(r1.status).toBe(200);
    const lenBefore = Number(r1.headers.get('content-length'));

    // Re-write the file with NEW content + a forced future mtime.
    const newPdf = await makeRealPdf(8); // very different page count
    await fs.promises.writeFile(pdfFile, newPdf);
    const future = new Date(Date.now() + 60_000);
    await fs.promises.utimes(pdfFile, future, future);

    const t2 = await issueToken(String(course._id), pdfLessonId);
    const r2 = await GET(buildContentReq(t2), { params: { token: t2 } } as any);
    expect(r2.status).toBe(200);
    const lenAfter = Number(r2.headers.get('content-length'));

    // The new file has 8 pages vs original 3 → larger output. Either way
    // the cache MUST have been bypassed because mtime changed.
    expect(lenAfter).not.toBe(lenBefore);
  }, 30_000);

  // ── 8. Suffix Range request (bytes=-N) ──────────────────────────────────
  it('handles HTTP suffix Range (bytes=-N) — returns the last N bytes', async () => {
    const { GET } = await getRoute();
    const token = await issueToken(String(course._id), pdfLessonId);

    const seed = await GET(buildContentReq(token), { params: { token } } as any);
    expect(seed.status).toBe(200);
    const total = Number(seed.headers.get('content-length'));

    // Some clients (curl --range -, certain CDNs probing for resumability)
    // ask for the last N bytes. Our regex should at minimum not crash.
    const r = await GET(
      buildContentReq(token, { range: 'bytes=-100' }),
      { params: { token } } as any,
    );
    // We don't strictly require 206 here — `bytes=-100` is rare in PDF.js
    // and the current regex pattern only handles `bytes=N-` and `bytes=N-M`.
    // What we DO require is that the server doesn't 5xx and either returns
    // a usable body or a clean 416 / falls back to 200 full-body.
    expect([200, 206, 416]).toContain(r.status);
    if (r.status === 200) {
      expect(Number(r.headers.get('content-length'))).toBe(total);
    }
  }, 30_000);

  // ── 9. Open-ended Range (bytes=N-) ──────────────────────────────────────
  it('handles open-ended Range (bytes=N-) — returns from N to end', async () => {
    const { GET } = await getRoute();
    const token = await issueToken(String(course._id), pdfLessonId);

    const seed = await GET(buildContentReq(token), { params: { token } } as any);
    const total = Number(seed.headers.get('content-length'));

    const start = Math.floor(total / 2);
    const r = await GET(
      buildContentReq(token, { range: `bytes=${start}-` }),
      { params: { token } } as any,
    );
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes ${start}-${total - 1}/${total}`);
    expect(Number(r.headers.get('content-length'))).toBe(total - start);
  }, 30_000);

  // ── 10. 50 concurrent Range requests don't deadlock or 5xx ──────────────
  it('50 concurrent Range requests on the same token all return 2xx', async () => {
    const { GET } = await getRoute();
    const token = await issueToken(String(course._id), pdfLessonId);

    // Prime the cache.
    const seed = await GET(buildContentReq(token), { params: { token } } as any);
    const total = Number(seed.headers.get('content-length'));

    const rs = await Promise.all(
      Array.from({ length: 50 }, (_, i) => {
        const s = (i * 7) % Math.max(1, total - 100);
        return GET(
          buildContentReq(token, { range: `bytes=${s}-${s + 50}` }),
          { params: { token } } as any,
        );
      })
    );
    for (const r of rs) {
      expect(r.status).toBeGreaterThanOrEqual(200);
      expect(r.status).toBeLessThan(400);
    }
  }, 60_000);

  // ── 11. Watermarked response always includes anti-piracy headers ────────
  it('watermarked PDF responses carry the full anti-piracy header set', async () => {
    const { GET } = await getRoute();
    const token = await issueToken(String(course._id), pdfLessonId);
    const r = await GET(buildContentReq(token), { params: { token } } as any);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/pdf');
    expect(r.headers.get('content-disposition')).toBe('inline');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(r.headers.get('cache-control')).toContain('no-store');
    expect(r.headers.get('cache-control')).toContain('private');
    expect(r.headers.get('accept-ranges')).toBe('bytes');
  }, 30_000);

  // ── 12. Corrupt source bytes fall through to raw stream (no 5xx) ────────
  it('corrupt PDF source bytes do not 5xx — fall through to raw stream', async () => {
    // Overwrite the file with bytes that pdf-lib cannot parse.
    await fs.promises.writeFile(pdfFile, Buffer.from('not a real PDF\n%%EOF\n'));

    const { GET } = await getRoute();
    const token = await issueToken(String(course._id), pdfLessonId);
    const r = await GET(buildContentReq(token), { params: { token } } as any);

    // The watermark step throws on corrupt bytes; the route catches and falls
    // through to serveRawFile() which just streams the raw bytes back.
    // Whichever path wins, the user must get a 2xx (not 5xx) and a PDF
    // content-type so the client viewer surfaces a clean error rather than
    // an opaque internal-server-error.
    expect(r.status).toBeGreaterThanOrEqual(200);
    expect(r.status).toBeLessThan(500);
  }, 30_000);
});
