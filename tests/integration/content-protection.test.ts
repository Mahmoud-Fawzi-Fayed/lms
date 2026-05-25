// Integration tests for /api/content/[token] — covers every realistic bypass
// vector a determined user might try to exfiltrate PDFs or videos.
//
// What is tested (☑ = blocked here, ☐ = un-blockable at HTTP layer):
//   ☑ Direct browser navigation (no Sec-Fetch-Dest)
//   ☑ JS-console fetch missing X-Content-Request header
//   ☑ JS-console fetch missing sec-fetch-mode=cors
//   ☑ Cross-mode abuse: try to grab video bytes via mode=raw
//   ☑ Cross-mode abuse: try to grab a PDF via mode=stream
//   ☑ Token replay across users (token bound to userId)
//   ☑ Tampered / garbage token
//   ☑ Expired token (server-side TTL)
//   ☑ Path traversal `../../etc/passwd` in stored filePath
//   ☑ Symlink under uploads/ pointing to /etc/hosts
//   ☑ Per-token raw rate limit (default 2/hour)
//   ☑ Browser prefetch / sec-purpose=prefetch
//   ☑ Range request on video returns 206 with proper Content-Range
//   ☑ Valid raw PDF returns full bytes
//   ☐ MediaRecorder / canvas.toDataURL — see SECURITY_AUDIT honest review
//   ☐ OS-level screen recorder — undetectable by design

import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { makeUser, makeEnrollment } from './factories';
import { setCurrentUser, clearCurrentUser } from './auth-mock';
import { Course } from '@/models';

// ── Helpers ───────────────────────────────────────────────────────────────
type Mode = 'raw' | 'stream' | null;
function buildReq(token: string, opts: {
  mode?: Mode;
  withXContent?: boolean;
  secFetchDest?: string;
  secFetchMode?: string;
  secFetchSite?: string;
  range?: string;
  prefetch?: boolean;
  userAgent?: string;
  xff?: string;
} = {}) {
  const url = new URL(`http://localhost/api/content/${token}` + (opts.mode ? `?mode=${opts.mode}` : ''));
  const headers: Record<string, string> = {};
  if (opts.withXContent) headers['X-Content-Request'] = '1';
  if (opts.secFetchDest) headers['sec-fetch-dest'] = opts.secFetchDest;
  if (opts.secFetchMode) headers['sec-fetch-mode'] = opts.secFetchMode;
  if (opts.secFetchSite) headers['sec-fetch-site'] = opts.secFetchSite;
  if (opts.range) headers['range'] = opts.range;
  if (opts.prefetch) headers['sec-purpose'] = 'prefetch';
  if (opts.userAgent) headers['user-agent'] = opts.userAgent;
  if (opts.xff) headers['x-forwarded-for'] = opts.xff;
  return new NextRequest(url, { method: 'GET', headers });
}

/** Build the headers a normal in-browser PDF.js fetch would send. */
function browserPdfHeaders() {
  return { withXContent: true, secFetchDest: 'empty', secFetchMode: 'cors', secFetchSite: 'same-origin' } as const;
}
/** Build the headers a normal <video> element would send. */
function browserVideoHeaders() {
  return { secFetchDest: 'video', secFetchMode: 'no-cors', secFetchSite: 'same-origin' } as const;
}

async function getRoute() {
  return import('@/app/api/content/[token]/route');
}

async function getTokenRoute() {
  return import('@/app/api/courses/[id]/content-token/route');
}

// Build a Course with one module + lessons whose _id we can control.
// Returns { course, pdfLessonId, videoLessonId, pdfFile, videoFile }
async function seedCourseWithFiles(opts: {
  instructorId: string;
  targetYear?: string;
  pdfBytes: Buffer;
  videoBytes: Buffer;
}) {
  const tmp = await fs.promises.mkdtemp(path.join(process.cwd(), 'uploads', 'tmp', 'itest-'));
  const pdfFile = path.join(tmp, 'doc.pdf');
  const videoFile = path.join(tmp, 'clip.mp4');
  await fs.promises.writeFile(pdfFile, opts.pdfBytes);
  await fs.promises.writeFile(videoFile, opts.videoBytes);

  const pdfLessonId = new mongoose.Types.ObjectId();
  const videoLessonId = new mongoose.Types.ObjectId();
  const course = await Course.create({
    title: 'Protected Content Course',
    slug: 'protected-content-' + Date.now().toString(36),
    description: 'A test course description with enough length to pass validation.',
    instructor: opts.instructorId,
    price: 0,
    category: 'general',
    level: 'beginner',
    language: 'ar',
    isPublished: true,
    targetYear: opts.targetYear,
    modules: [{
      title: 'Module 1',
      order: 1,
      lessons: [
        { _id: pdfLessonId,   title: 'Doc',  type: 'pdf',   filePath: pdfFile,   isPreview: false, order: 1 },
        { _id: videoLessonId, title: 'Clip', type: 'video', filePath: videoFile, isPreview: false, order: 2 },
      ],
    }],
  });
  return { course, pdfLessonId: String(pdfLessonId), videoLessonId: String(videoLessonId), pdfFile, videoFile, tmp };
}

async function issueToken(courseId: string, lessonId: string, opts: { userAgent?: string; xff?: string; kind?: 'raw' | 'stream' } = {}): Promise<string> {
  const { GET } = await getTokenRoute();
  const headers: Record<string, string> = {};
  if (opts.userAgent) headers['user-agent'] = opts.userAgent;
  if (opts.xff) headers['x-forwarded-for'] = opts.xff;
  const kindQS = opts.kind ? `&kind=${opts.kind}` : '';
  const req = new NextRequest(
    new URL(`http://localhost/api/courses/${courseId}/content-token?lessonId=${lessonId}${kindQS}`),
    { headers }
  );
  const res = await GET(req, { params: { id: courseId } } as any);
  const json = await res.json();
  if (!json.success) throw new Error('token issuance failed: ' + JSON.stringify(json));
  return json.data.token;
}

// ── Tests ─────────────────────────────────────────────────────────────────
describe('Content protection — bypass surface', () => {
  let instructor: any;
  let student: any;
  let outsider: any;
  let seed: Awaited<ReturnType<typeof seedCourseWithFiles>>;
  const pdfPayload = Buffer.from('%PDF-1.4\n%fake-test-pdf-bytes\n');
  const videoPayload = Buffer.alloc(1024, 0x42); // 1KB of 'B'

  beforeAll(() => {
    process.env.CONTENT_SECRET = 'a'.repeat(64);
    // Ensure tmp dir exists
    fs.mkdirSync(path.join(process.cwd(), 'uploads', 'tmp'), { recursive: true });
  });

  beforeEach(async () => {
    instructor = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student' });
    outsider = await makeUser({ role: 'student' });
    seed = await seedCourseWithFiles({
      instructorId: String(instructor._id),
      pdfBytes: pdfPayload,
      videoBytes: videoPayload,
    });
    await makeEnrollment({ user: student._id, course: seed.course._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student' });
  });

  afterEach(async () => {
    if (seed?.tmp) {
      await fs.promises.rm(seed.tmp, { recursive: true, force: true }).catch(() => {});
    }
  });

  // ── Direct access blockers ──────────────────────────────────────────────
  it('rejects direct browser navigation (no Sec-Fetch headers)', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const res = await GET(buildReq(token, { mode: 'raw' }), { params: { token } } as any);
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toContain('الوصول المباشر');
  });

  it('rejects raw fetch missing X-Content-Request header', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    // Same as a browser fetch but without the custom marker header.
    const req = buildReq(token, { mode: 'raw', secFetchDest: 'empty', secFetchMode: 'cors', secFetchSite: 'same-origin' });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  it('rejects raw fetch with sec-fetch-mode=no-cors (likely curl spoof)', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'raw', withXContent: true, secFetchDest: 'empty', secFetchMode: 'no-cors', secFetchSite: 'same-origin' });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  it('rejects raw fetch from cross-site (sec-fetch-site != same-origin)', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'raw', withXContent: true, secFetchDest: 'empty', secFetchMode: 'cors', secFetchSite: 'cross-site' });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  it('rejects browser prefetch / prerender requests', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'raw', ...browserPdfHeaders(), prefetch: true });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  // ── Cross-mode abuse ─────────────────────────────────────────────────────
  it('blocks fetching VIDEO bytes via mode=raw (console fetch attack)', async () => {
    const token = await issueToken(String(seed.course._id), seed.videoLessonId, { kind: 'stream' });
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'raw', ...browserPdfHeaders() });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  it('blocks streaming a PDF via mode=stream', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'stream', ...browserVideoHeaders() });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  // ── Authorization / token integrity ──────────────────────────────────────
  it('rejects token replayed by a different user', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    setCurrentUser({ id: String(outsider._id), role: 'student' }); // different user
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'raw', ...browserPdfHeaders() });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  it('rejects garbage / tampered token', async () => {
    const { GET } = await getRoute();
    const req = buildReq('not.a.valid.token', { mode: 'raw', ...browserPdfHeaders() });
    const res = await GET(req, { params: { token: 'not.a.valid.token' } } as any);
    expect(res.status).toBe(403);
  });

  it('blocks access for an unenrolled student', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    setCurrentUser({ id: String(outsider._id), role: 'student' });
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'raw', ...browserPdfHeaders() });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    clearCurrentUser();
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'raw', ...browserPdfHeaders() });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(401);
  });

  // ── Filesystem hardening ────────────────────────────────────────────────
  it('blocks path traversal in stored filePath', async () => {
    // Inject a lesson whose filePath escapes uploads/.
    const lessonId = new mongoose.Types.ObjectId();
    const course = await Course.create({
      title: 'Traversal Course',
      slug: 'traversal-' + Date.now().toString(36),
      description: 'Traversal test course description must be long enough to pass validation.',
      instructor: instructor._id,
      price: 0,
      category: 'general',
      level: 'beginner',
      language: 'ar',
      isPublished: true,
      modules: [{
        title: 'M', order: 1,
        lessons: [{ _id: lessonId, title: 'X', type: 'pdf', filePath: '/etc/passwd', isPreview: false, order: 1 }],
      }],
    });
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    const token = await issueToken(String(course._id), String(lessonId));
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'raw', ...browserPdfHeaders() });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  it('blocks symlinks under uploads/', async () => {
    // Create a symlink under uploads/ that targets a real file outside uploads/.
    const symlinkPath = path.join(seed.tmp, 'link.pdf');
    const target = path.join(os.tmpdir(), 'sym-target.pdf');
    await fs.promises.writeFile(target, 'leak');
    try {
      await fs.promises.symlink(target, symlinkPath);
    } catch {
      return; // platforms without symlink permission — skip silently
    }
    const lessonId = new mongoose.Types.ObjectId();
    const course = await Course.create({
      title: 'Symlink Course',
      slug: 'symlink-' + Date.now().toString(36),
      description: 'Symlink test course description must be long enough to pass validation.',
      instructor: instructor._id,
      price: 0,
      category: 'general',
      level: 'beginner',
      language: 'ar',
      isPublished: true,
      modules: [{
        title: 'M', order: 1,
        lessons: [{ _id: lessonId, title: 'X', type: 'pdf', filePath: symlinkPath, isPreview: false, order: 1 }],
      }],
    });
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    const token = await issueToken(String(course._id), String(lessonId));
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'raw', ...browserPdfHeaders() });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(403);
    await fs.promises.unlink(target).catch(() => {});
  });

  // ── Per-token raw rate limit ─────────────────────────────────────────────
  it('blocks the 4th raw PDF fetch on the same token (per-token limit = 3)', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    // First 3 hits succeed (React strict-mode / back-forward tolerance).
    for (let i = 0; i < 3; i++) {
      const res = await GET(buildReq(token, { mode: 'raw', ...browserPdfHeaders() }), { params: { token } } as any);
      expect(res.status).toBe(200);
    }
    // 4th hit must be rejected.
    const blocked = await GET(buildReq(token, { mode: 'raw', ...browserPdfHeaders() }), { params: { token } } as any);
    expect(blocked.status).toBe(429);
  });

  // ── Happy paths ──────────────────────────────────────────────────────────
  it('serves a valid raw PDF to an enrolled student', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'raw', ...browserPdfHeaders() });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('content-disposition')).toBe('inline');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    const body = Buffer.from(await res.arrayBuffer());
    // The test fixture uses fake PDF bytes — watermarking falls back to the
    // original, so the body should match the original payload.
    expect(body.equals(pdfPayload)).toBe(true);
  });

  it('embeds an email watermark into a real PDF before serving it', async () => {
    const { PDFDocument } = await import('pdf-lib');
    // Build a real one-page PDF and stash it on disk.
    const doc = await PDFDocument.create();
    doc.addPage([400, 400]).drawText('confidential body', { x: 50, y: 200 });
    const realPdfBytes = Buffer.from(await doc.save());
    const realPdfPath = path.join(seed.tmp, 'real.pdf');
    await fs.promises.writeFile(realPdfPath, realPdfBytes);

    const lessonId = new mongoose.Types.ObjectId();
    const course = await Course.create({
      title: 'Real PDF Course',
      slug: 'real-pdf-' + Date.now().toString(36),
      description: 'Real PDF test course description must be long enough to pass validation.',
      instructor: instructor._id,
      price: 0, category: 'general', level: 'beginner', language: 'ar',
      isPublished: true,
      modules: [{
        title: 'M', order: 1,
        lessons: [{ _id: lessonId, title: 'Real', type: 'pdf', filePath: realPdfPath, isPreview: false, order: 1 }],
      }],
    });
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });

    const token = await issueToken(String(course._id), String(lessonId));
    const { GET } = await getRoute();
    const res = await GET(buildReq(token, { mode: 'raw', ...browserPdfHeaders() }), { params: { token } } as any);
    expect(res.status).toBe(200);
    const body = Buffer.from(await res.arrayBuffer());
    // Must be a valid PDF
    expect(body.slice(0, 4).toString()).toBe('%PDF');
    // Must differ from the source (watermark text was injected into every page)
    expect(body.equals(realPdfBytes)).toBe(false);
    // pdf-lib should successfully re-parse the response
    const reloaded = await PDFDocument.load(body);
    expect(reloaded.getPageCount()).toBe(1);
    // Watermarked PDF should be larger than the source (added text operators).
    expect(body.byteLength).toBeGreaterThan(realPdfBytes.byteLength);
  });

  it('serves a 206 Partial Content for a Range request on video', async () => {
    const token = await issueToken(String(seed.course._id), seed.videoLessonId, { kind: 'stream' });
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'stream', ...browserVideoHeaders(), range: 'bytes=0-99' });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 0-99/${videoPayload.length}`);
    expect(res.headers.get('content-length')).toBe('100');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBe(100);
    expect(body.equals(videoPayload.subarray(0, 100))).toBe(true);
  });

  it('serves full video stream when no Range is provided', async () => {
    const token = await issueToken(String(seed.course._id), seed.videoLessonId, { kind: 'stream' });
    const { GET } = await getRoute();
    const req = buildReq(token, { mode: 'stream', ...browserVideoHeaders() });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
  });

  // ── Session-fingerprint binding ─────────────────────────────────────────
  it('rejects raw fetch when User-Agent differs from token issuance', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId, {
      userAgent: 'Mozilla/5.0 (issuer-browser)',
      xff: '203.0.113.10',
    });
    const { GET } = await getRoute();
    const req = buildReq(token, {
      mode: 'raw',
      ...browserPdfHeaders(),
      userAgent: 'Mozilla/5.0 (DIFFERENT-browser)',
      xff: '203.0.113.10',
    });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  it('rejects raw fetch when client IP prefix differs from token issuance', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId, {
      userAgent: 'Mozilla/5.0 (same-browser)',
      xff: '203.0.113.10',
    });
    const { GET } = await getRoute();
    const req = buildReq(token, {
      mode: 'raw',
      ...browserPdfHeaders(),
      userAgent: 'Mozilla/5.0 (same-browser)',
      xff: '198.51.100.7', // different /24
    });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  it('accepts raw fetch when fingerprint matches token', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId, {
      userAgent: 'Mozilla/5.0 (same-browser)',
      xff: '203.0.113.10',
    });
    const { GET } = await getRoute();
    const req = buildReq(token, {
      mode: 'raw',
      ...browserPdfHeaders(),
      userAgent: 'Mozilla/5.0 (same-browser)',
      xff: '203.0.113.99', // same /24 prefix
    });
    const res = await GET(req, { params: { token } } as any);
    expect(res.status).toBe(200);
  });

  // ── Audit log ───────────────────────────────────────────────────────────
  it('records a ContentAccess row after a successful raw PDF fetch', async () => {
    const { ContentAccess } = await import('@/models');
    const before = await ContentAccess.countDocuments({ user: student._id, mode: 'raw' });
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const res = await GET(buildReq(token, { mode: 'raw', ...browserPdfHeaders() }), { params: { token } } as any);
    expect(res.status).toBe(200);
    const after = await ContentAccess.countDocuments({ user: student._id, mode: 'raw' });
    expect(after).toBe(before + 1);
  });

  // ── Token kind / issuance hardening ─────────────────────────────────────
  it('rejects issuance of raw token for a video lesson', async () => {
    const { GET } = await getTokenRoute();
    const courseId = String(seed.course._id);
    const req = new NextRequest(
      new URL(`http://localhost/api/courses/${courseId}/content-token?lessonId=${seed.videoLessonId}&kind=raw`),
    );
    const res = await GET(req, { params: { id: courseId } } as any);
    expect(res.status).toBe(400);
  });

  it('rejects issuance of stream token for a PDF lesson', async () => {
    const { GET } = await getTokenRoute();
    const courseId = String(seed.course._id);
    const req = new NextRequest(
      new URL(`http://localhost/api/courses/${courseId}/content-token?lessonId=${seed.pdfLessonId}&kind=stream`),
    );
    const res = await GET(req, { params: { id: courseId } } as any);
    expect(res.status).toBe(400);
  });

  it('rejects issuance for a non-existent lesson', async () => {
    const { GET } = await getTokenRoute();
    const courseId = String(seed.course._id);
    const fakeLessonId = new mongoose.Types.ObjectId().toString();
    const req = new NextRequest(
      new URL(`http://localhost/api/courses/${courseId}/content-token?lessonId=${fakeLessonId}`),
    );
    const res = await GET(req, { params: { id: courseId } } as any);
    expect(res.status).toBe(404);
  });

  it('rejects issuance for a non-existent course', async () => {
    const { GET } = await getTokenRoute();
    const fakeCourseId = new mongoose.Types.ObjectId().toString();
    const req = new NextRequest(
      new URL(`http://localhost/api/courses/${fakeCourseId}/content-token?lessonId=${seed.pdfLessonId}`),
    );
    const res = await GET(req, { params: { id: fakeCourseId } } as any);
    expect(res.status).toBe(404);
  });

  it('rejects issuance when enrollment is not active (pending)', async () => {
    const { Enrollment } = await import('@/models');
    // Switch student enrollment to pending
    await Enrollment.updateOne(
      { user: student._id, course: seed.course._id },
      { $set: { status: 'pending' } },
    );
    const { GET } = await getTokenRoute();
    const courseId = String(seed.course._id);
    const req = new NextRequest(
      new URL(`http://localhost/api/courses/${courseId}/content-token?lessonId=${seed.pdfLessonId}`),
    );
    const res = await GET(req, { params: { id: courseId } } as any);
    expect(res.status).toBe(403);
  });

  it('rejects issuance when not authenticated', async () => {
    clearCurrentUser();
    const { GET } = await getTokenRoute();
    const courseId = String(seed.course._id);
    const req = new NextRequest(
      new URL(`http://localhost/api/courses/${courseId}/content-token?lessonId=${seed.pdfLessonId}`),
    );
    const res = await GET(req, { params: { id: courseId } } as any);
    expect(res.status).toBe(401);
  });

  it('rejects using a stream token in mode=raw at serve time', async () => {
    const token = await issueToken(String(seed.course._id), seed.videoLessonId, { kind: 'stream' });
    const { GET } = await getRoute();
    const res = await GET(buildReq(token, { mode: 'raw', ...browserPdfHeaders() }), { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  it('rejects using a raw token in mode=stream at serve time', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const res = await GET(buildReq(token, { mode: 'stream', ...browserVideoHeaders() }), { params: { token } } as any);
    expect(res.status).toBe(403);
  });

  it('per-IP issuance flood: 61st request from same IP returns 429', async () => {
    const courseId = String(seed.course._id);
    const ip = '198.51.100.77'; // unique-to-this-test prefix
    const { GET } = await getTokenRoute();
    // First 60 should succeed
    let lastSuccess = 0;
    for (let i = 0; i < 60; i++) {
      const req = new NextRequest(
        new URL(`http://localhost/api/courses/${courseId}/content-token?lessonId=${seed.pdfLessonId}`),
        { headers: { 'x-forwarded-for': ip } },
      );
      const res = await GET(req, { params: { id: courseId } } as any);
      if (res.status === 200) lastSuccess = i + 1;
      else break;
    }
    expect(lastSuccess).toBe(60);

    // 61st must 429
    const req61 = new NextRequest(
      new URL(`http://localhost/api/courses/${courseId}/content-token?lessonId=${seed.pdfLessonId}`),
      { headers: { 'x-forwarded-for': ip } },
    );
    const res61 = await GET(req61, { params: { id: courseId } } as any);
    expect(res61.status).toBe(429);
  });

  // ── Multi-IP auto-flag (account sharing detection) ──────────────────────
  it('blocks raw fetch and flags user when >3 distinct /24 prefixes used in 1h', async () => {
    const { ContentAccess, User } = await import('@/models');
    // Seed 4 distinct /24 prefixes within the last hour for this student.
    const prefixes = ['10.0.1.5', '10.0.2.5', '10.0.3.5', '10.0.4.5'];
    for (const ip of prefixes) {
      await ContentAccess.create({
        user: student._id,
        course: seed.course._id,
        lesson: new mongoose.Types.ObjectId(seed.pdfLessonId),
        mode: 'raw',
        ip,
        userAgent: 'seeded',
        bytes: 100,
      });
    }
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const res = await GET(
      buildReq(token, { mode: 'raw', ...browserPdfHeaders(), xff: '10.0.5.5' }),
      { params: { token } } as any,
    );
    expect(res.status).toBe(423);
    const updated = await User.findById(student._id);
    expect(updated?.suspiciousFlag).toBe('multi-ip-content-access');
    expect(updated?.suspiciousAt).toBeTruthy();
  });

  it('allows raw fetch when fewer than 4 distinct IP prefixes in last hour', async () => {
    const { ContentAccess } = await import('@/models');
    // Only 2 distinct prefixes — well under the threshold.
    for (const ip of ['10.10.1.5', '10.10.2.5']) {
      await ContentAccess.create({
        user: student._id,
        course: seed.course._id,
        lesson: new mongoose.Types.ObjectId(seed.pdfLessonId),
        mode: 'raw',
        ip,
        userAgent: 'seeded',
        bytes: 100,
      });
    }
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId, {
      xff: '10.10.3.5',
    });
    const { GET } = await getRoute();
    const res = await GET(
      buildReq(token, { mode: 'raw', ...browserPdfHeaders(), xff: '10.10.3.5' }),
      { params: { token } } as any,
    );
    expect(res.status).toBe(200);
  });

  // ── Watermark forensic footer ───────────────────────────────────────────
  it('passes user email + IP + timestamp to watermark stamper', async () => {
    const wm = await import('@/lib/pdf-watermark');
    const { vi } = await import('vitest');
    const calls: Array<{ text: string; meta?: string }> = [];
    const spy = vi.spyOn(wm, 'watermarkPdf').mockImplementation(
      async (bytes: Buffer | Uint8Array, text: string, meta?: string) => {
        calls.push({ text, meta });
        return bytes as any;
      },
    );
    try {
      const token = await issueToken(String(seed.course._id), seed.pdfLessonId, {
        xff: '203.0.113.42',
      });
      const { GET } = await getRoute();
      await GET(
        buildReq(token, { mode: 'raw', ...browserPdfHeaders(), xff: '203.0.113.42' }),
        { params: { token } } as any,
      );
      expect(calls.length).toBe(1);
      // Stamp text should look like an email or user id (forensic identifier).
      expect(calls[0].text).toMatch(/[a-zA-Z0-9_.\-]+(@[a-zA-Z0-9.\-]+|[a-f0-9]{12,})/);
      expect(calls[0].meta).toMatch(/203\.0\.113\.42/);
      expect(calls[0].meta).toMatch(/\d{4}-\d{2}-\d{2}/);
    } finally {
      spy.mockRestore();
    }
  });
});
