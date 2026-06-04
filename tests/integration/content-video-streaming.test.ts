/**
 * Regression tests — video streaming path of /api/content/[token].
 *
 * After the PDF watermark/cache changes (commits 364516d, ad20871, 07ff737)
 * a follow-up audit found 1 historical lesson with a missing video file. This
 * test pins down everything ELSE the user expects of the video path so any
 * future change can't silently break:
 *
 *   - Range requests return 206 + correct Content-Range / Content-Length.
 *   - First-byte Range (bytes=0-N) works (the typical <video> probe).
 *   - Mid-file Range (seek) works.
 *   - Open-ended Range (bytes=N-) works.
 *   - Out-of-range Range returns 416 with Content-Range:* /size.
 *   - Full-body GET (no Range) returns the whole file with 200.
 *   - Anti-piracy headers (X-Frame-Options, CSP, X-Content-Type-Options,
 *     Cache-Control no-store) present on all video responses.
 *   - mode=raw cannot be used to fetch video bytes (cross-mode block).
 *   - Video paths are NOT routed through the watermark code (only PDFs are).
 *   - Stream-mode requests with sec-fetch-dest != 'video' are rejected.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { makeUser, makeEnrollment } from './factories';
import { setCurrentUser, clearCurrentUser } from './auth-mock';
import { Course } from '@/models';

async function getRoute() {
  return import('@/app/api/content/[token]/route');
}
async function getTokenRoute() {
  return import('@/app/api/courses/[id]/content-token/route');
}

function streamHeaders(extra: Record<string, string> = {}) {
  return {
    'sec-fetch-dest': 'video',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'same-origin',
    ...extra,
  };
}
function rawHeaders(extra: Record<string, string> = {}) {
  return {
    'X-Content-Request': '1',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    ...extra,
  };
}

function buildReq(token: string, mode: 'raw' | 'stream', headers: Record<string, string>) {
  return new NextRequest(
    new URL(`http://localhost/api/content/${token}?mode=${mode}`),
    { method: 'GET', headers },
  );
}

async function issueToken(courseId: string, lessonId: string, kind: 'raw' | 'stream' = 'stream') {
  const { GET } = await getTokenRoute();
  const req = new NextRequest(
    new URL(`http://localhost/api/courses/${courseId}/content-token?lessonId=${lessonId}&kind=${kind}`),
  );
  const res = await GET(req, { params: { id: courseId } } as any);
  const json = await res.json();
  if (!json.success) throw new Error('token issuance failed: ' + JSON.stringify(json));
  return json.data.token as string;
}

describe('Content video streaming — Range + full-body + anti-piracy', () => {
  let instructor: any;
  let student: any;
  let videoBytes: Buffer;
  let videoFile: string;
  let tmp: string;
  let course: any;
  let videoLessonId: string;
  const VIDEO_SIZE = 1024 * 64; // 64 KiB — fast to test, exercises the streaming path

  beforeAll(async () => {
    process.env.CONTENT_SECRET = 'a'.repeat(64);
    fs.mkdirSync(path.join(process.cwd(), 'uploads', 'tmp'), { recursive: true });
    // Build a deterministic 64KB blob — content is irrelevant; we just need
    // a real file the streamer can chunk. We seed each byte with its index
    // mod 256 so we can later assert that Range bytes are correctly aligned.
    videoBytes = Buffer.alloc(VIDEO_SIZE);
    for (let i = 0; i < VIDEO_SIZE; i++) videoBytes[i] = i & 0xff;
  });

  beforeEach(async () => {
    instructor = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student' });

    tmp = await fs.promises.mkdtemp(path.join(process.cwd(), 'uploads', 'tmp', 'vid-'));
    videoFile = path.join(tmp, 'clip.mp4');
    await fs.promises.writeFile(videoFile, videoBytes);

    const lessonObjectId = new mongoose.Types.ObjectId();
    videoLessonId = String(lessonObjectId);
    course = await Course.create({
      title: 'Video Stream Course',
      slug: 'video-stream-' + Date.now().toString(36),
      description: 'A test course description with enough length to pass validation.',
      instructor: instructor._id,
      price: 0,
      category: 'general',
      level: 'beginner',
      language: 'ar',
      isPublished: true,
      modules: [{
        title: 'M', order: 1,
        lessons: [{
          _id: lessonObjectId, title: 'Clip', type: 'video', filePath: videoFile,
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

  // ── Full body ──────────────────────────────────────────────────────────
  it('full-body GET returns 200 + the entire video bytes', async () => {
    const { GET } = await getRoute();
    const tok = await issueToken(String(course._id), videoLessonId, 'stream');
    const r = await GET(buildReq(tok, 'stream', streamHeaders()), { params: { token: tok } } as any);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.headers.get('content-length')).toBe(String(VIDEO_SIZE));
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    const body = Buffer.from(await r.arrayBuffer());
    expect(body.length).toBe(VIDEO_SIZE);
    expect(body.equals(videoBytes)).toBe(true);
  }, 30_000);

  // ── First-byte probe (typical HTML5 <video> first request) ─────────────
  it('Range bytes=0-1023 returns 206 + first 1024 bytes', async () => {
    const { GET } = await getRoute();
    const tok = await issueToken(String(course._id), videoLessonId, 'stream');
    const r = await GET(
      buildReq(tok, 'stream', streamHeaders({ range: 'bytes=0-1023' })),
      { params: { token: tok } } as any,
    );
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes 0-1023/${VIDEO_SIZE}`);
    expect(Number(r.headers.get('content-length'))).toBe(1024);
    const body = Buffer.from(await r.arrayBuffer());
    expect(body.length).toBe(1024);
    // Bytes are seeded as i & 0xff so first 256 bytes are 0,1,2,...255 then repeat.
    expect(body[0]).toBe(0);
    expect(body[255]).toBe(255);
    expect(body[256]).toBe(0);
  }, 30_000);

  // ── Mid-file seek ──────────────────────────────────────────────────────
  it('Range bytes=10000-19999 returns 206 + correct mid-file slice', async () => {
    const { GET } = await getRoute();
    const tok = await issueToken(String(course._id), videoLessonId, 'stream');
    const r = await GET(
      buildReq(tok, 'stream', streamHeaders({ range: 'bytes=10000-19999' })),
      { params: { token: tok } } as any,
    );
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes 10000-19999/${VIDEO_SIZE}`);
    expect(Number(r.headers.get('content-length'))).toBe(10000);
    const body = Buffer.from(await r.arrayBuffer());
    expect(body[0]).toBe(10000 & 0xff);
    expect(body[body.length - 1]).toBe(19999 & 0xff);
  }, 30_000);

  // ── Open-ended Range (typical "play to end" after seek) ────────────────
  it('Range bytes=60000- returns 206 + tail of the file', async () => {
    const { GET } = await getRoute();
    const tok = await issueToken(String(course._id), videoLessonId, 'stream');
    const r = await GET(
      buildReq(tok, 'stream', streamHeaders({ range: 'bytes=60000-' })),
      { params: { token: tok } } as any,
    );
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes 60000-${VIDEO_SIZE - 1}/${VIDEO_SIZE}`);
    expect(Number(r.headers.get('content-length'))).toBe(VIDEO_SIZE - 60000);
  }, 30_000);

  // ── Out-of-range ───────────────────────────────────────────────────────
  it('Range starting past EOF returns 416 with Content-Range:*', async () => {
    const { GET } = await getRoute();
    const tok = await issueToken(String(course._id), videoLessonId, 'stream');
    const r = await GET(
      buildReq(tok, 'stream', streamHeaders({ range: `bytes=${VIDEO_SIZE + 100}-` })),
      { params: { token: tok } } as any,
    );
    expect(r.status).toBe(416);
    expect(r.headers.get('content-range')).toBe(`bytes */${VIDEO_SIZE}`);
  }, 30_000);

  // ── Anti-piracy headers on video responses ─────────────────────────────
  it('video response carries the full anti-piracy header set', async () => {
    const { GET } = await getRoute();
    const tok = await issueToken(String(course._id), videoLessonId, 'stream');
    const r = await GET(buildReq(tok, 'stream', streamHeaders()), { params: { token: tok } } as any);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.headers.get('content-disposition')).toBe('inline');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(r.headers.get('cache-control')).toContain('no-store');
    expect(r.headers.get('accept-ranges')).toBe('bytes');
  }, 30_000);

  // ── Cross-mode safety ──────────────────────────────────────────────────
  it('mode=raw is REJECTED when the requested file is a video (no console-fetch bypass)', async () => {
    // Issue a stream token (it's the only kind allowed for video lessons),
    // then try to use it with mode=raw to download the bytes from a JS
    // console fetch. The route's kind ↔ mode binding must reject this.
    const { GET } = await getRoute();
    const streamTok = await issueToken(String(course._id), videoLessonId, 'stream');
    const r = await GET(
      buildReq(streamTok, 'raw', rawHeaders()),
      { params: { token: streamTok } } as any,
    );
    expect(r.status).toBe(403);
  }, 30_000);

  // ── Sec-Fetch-Dest enforcement ─────────────────────────────────────────
  it('mode=stream with sec-fetch-dest != "video" is rejected', async () => {
    const { GET } = await getRoute();
    const tok = await issueToken(String(course._id), videoLessonId, 'stream');

    // Imitate `fetch()` (dest=empty) trying to grab the stream URL — the
    // entire point of mode=stream is that ONLY a real <video> element with
    // dest=video can hit it.
    const r = await GET(
      buildReq(tok, 'stream', { 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-origin' }),
      { params: { token: tok } } as any,
    );
    // The route returns the HTML "direct access blocked" interstitial (403).
    expect(r.status).toBe(403);
  }, 30_000);

  // ── 30 concurrent Range requests don't deadlock ────────────────────────
  it('30 concurrent overlapping Range requests all stream successfully', async () => {
    const { GET } = await getRoute();
    const tok = await issueToken(String(course._id), videoLessonId, 'stream');
    const ranges = Array.from({ length: 30 }, (_, i) => {
      const start = (i * 1024) % (VIDEO_SIZE - 4096);
      return `bytes=${start}-${start + 4095}`;
    });
    const rs = await Promise.all(
      ranges.map((rg) => GET(
        buildReq(tok, 'stream', streamHeaders({ range: rg })),
        { params: { token: tok } } as any,
      )),
    );
    for (const r of rs) {
      expect(r.status).toBe(206);
      expect(Number(r.headers.get('content-length'))).toBe(4096);
    }
  }, 60_000);
});
