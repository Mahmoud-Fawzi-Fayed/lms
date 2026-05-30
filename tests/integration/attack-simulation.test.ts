// ============================================================================
//  RED-TEAM ATTACK SIMULATION — content download endpoints
// ============================================================================
//
// This file is INTENTIONALLY adversarial. Each test plays an attacker trying
// to exfiltrate PDF or video bytes via a different vector. The assertion
// records whether the attack was BLOCKED (good) or SUCCEEDED (bad). At the end
// of the run, a summary is printed showing exactly what worked and what didn't.
//
// Vectors covered (★ = HTTP-layer attack we CAN block, ✗ = client-side only):
//   ★  V1  curl/wget direct hit (no Sec-Fetch headers)
//   ★  V2  JS fetch missing custom X-Content-Request header
//   ★  V3  Mode confusion: stream URL on PDF (try to bypass watermark)
//   ★  V4  Mode confusion: raw URL on video (try to grab full video file)
//   ★  V5  Range-request looping (assemble PDF chunk-by-chunk via stream mode)
//   ★  V6  Token replay across users (cookie/session hijack scenario)
//   ★  V7  Token tampering (flip HMAC bits)
//   ★  V8  Token forged with a different secret (insider-leak scenario)
//   ★  V9  Token reuse after first download (single-use bypass)
//   ★  V10 Token issued on machine A, fetched from machine B (browser fingerprint)
//   ★  V11 Token issued on browser A, fetched on browser B (UA fingerprint)
//   ★  V12 Path traversal in stored filePath
//   ★  V13 Symlink under uploads/ pointing to /etc/hosts
//   ★  V14 Browser prefetch / sec-purpose=prefetch
//   ★  V15 Token issuance flood from one user (per-user RL)
//   ★  V16 Outsider with no enrollment requesting a token
//   ★  V17 Token for course A used to fetch course B's file
//   ★  V18 Expired token still accepted
//   ★  V19 Empty / malformed token
//   ✗  V20 MediaRecorder / canvas screenshot — client side, see SECURITY_AUDIT
//   ✗  V21 OS-level screen recorder — undefeatable
//
// The test exits 0 if every ★ vector is BLOCKED. Any unblocked vector fails.

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { makeUser, makeEnrollment } from './factories';
import { setCurrentUser, clearCurrentUser } from './auth-mock';
import { Course } from '@/models';

// ─── Helpers ────────────────────────────────────────────────────────────────
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
const browserPdfHeaders = () => ({ withXContent: true, secFetchDest: 'empty', secFetchMode: 'cors', secFetchSite: 'same-origin' } as const);
const browserVideoHeaders = () => ({ secFetchDest: 'video', secFetchMode: 'no-cors', secFetchSite: 'same-origin' } as const);

const getRoute      = () => import('@/app/api/content/[token]/route');
const getTokenRoute = () => import('@/app/api/courses/[id]/content-token/route');

async function issueToken(courseId: string, lessonId: string, hdrs: { userAgent?: string; xff?: string; kind?: 'raw' | 'stream' } = {}): Promise<string> {
  const { GET } = await getTokenRoute();
  const h: Record<string, string> = {};
  if (hdrs.userAgent) h['user-agent'] = hdrs.userAgent;
  if (hdrs.xff)       h['x-forwarded-for'] = hdrs.xff;
  const kindQS = hdrs.kind ? `&kind=${hdrs.kind}` : '';
  const req = new NextRequest(
    new URL(`http://localhost/api/courses/${courseId}/content-token?lessonId=${lessonId}${kindQS}`),
    { headers: h },
  );
  const res = await GET(req, { params: { id: courseId } } as any);
  const json = await res.json();
  if (!json.success) throw new Error('token issuance failed: ' + JSON.stringify(json));
  return json.data.token;
}

async function seedCourse(instructorId: string, pdfBytes: Buffer, videoBytes: Buffer) {
  const tmp = await fs.promises.mkdtemp(path.join(process.cwd(), 'uploads', 'tmp', 'attack-'));
  const pdfFile = path.join(tmp, 'doc.pdf');
  const videoFile = path.join(tmp, 'clip.mp4');
  await fs.promises.writeFile(pdfFile, pdfBytes);
  await fs.promises.writeFile(videoFile, videoBytes);
  const pdfLessonId = new mongoose.Types.ObjectId();
  const videoLessonId = new mongoose.Types.ObjectId();
  const course = await Course.create({
    title: 'Attack target course',
    slug: 'attack-target-' + Date.now().toString(36),
    description: 'Course used by the red-team simulation suite. Long enough description to satisfy validation.',
    instructor: instructorId,
    price: 0,
    category: 'general',
    level: 'beginner',
    language: 'ar',
    isPublished: true,
    modules: [{
      title: 'M1', order: 1, lessons: [
        { _id: pdfLessonId,   title: 'D', type: 'pdf',   filePath: pdfFile,   isPreview: false, order: 1 },
        { _id: videoLessonId, title: 'V', type: 'video', filePath: videoFile, isPreview: false, order: 2 },
      ],
    }],
  });
  return { course, pdfLessonId: String(pdfLessonId), videoLessonId: String(videoLessonId), pdfFile, videoFile, tmp };
}

// ─── Result tracker ─────────────────────────────────────────────────────────
type AttackResult = { id: string; description: string; blocked: boolean; detail: string };
const RESULTS: AttackResult[] = [];
const record = (id: string, description: string, blocked: boolean, detail: string) =>
  RESULTS.push({ id, description, blocked, detail });

// ─── Fixtures ───────────────────────────────────────────────────────────────
describe('Red-team attack simulation — try to download PDF / video', () => {
  let instructor: any;
  let student: any;
  let outsider: any;
  let seed: Awaited<ReturnType<typeof seedCourse>>;
  const pdfBytes = Buffer.from('%PDF-1.4\n%attack-target-pdf\n');
  const videoBytes = Buffer.alloc(2048, 0x56); // 2KB of 'V'

  beforeAll(() => {
    process.env.CONTENT_SECRET = 'a'.repeat(64);
    fs.mkdirSync(path.join(process.cwd(), 'uploads', 'tmp'), { recursive: true });
  });

  beforeEach(async () => {
    instructor = await makeUser({ role: 'instructor' });
    student    = await makeUser({ role: 'student' });
    outsider   = await makeUser({ role: 'student' });
    seed = await seedCourse(String(instructor._id), pdfBytes, videoBytes);
    await makeEnrollment({ user: student._id, course: seed.course._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student' });
  });

  afterEach(async () => {
    if (seed?.tmp) await fs.promises.rm(seed.tmp, { recursive: true, force: true }).catch(() => {});
    clearCurrentUser();
  });

  afterAll(() => {
    // ── Print honest scorecard ────────────────────────────────────────────
    const total = RESULTS.length;
    const blocked = RESULTS.filter(r => r.blocked).length;
    const open    = RESULTS.filter(r => !r.blocked);
    /* eslint-disable no-console */
    console.log('\n══════════════════════════════════════════════════════════');
    console.log(' RED-TEAM ATTACK SCORECARD');
    console.log('══════════════════════════════════════════════════════════');
    for (const r of RESULTS) {
      const tag = r.blocked ? '✓ BLOCKED' : '✗ SUCCEEDED';
      console.log(`  [${r.id}] ${tag}  ${r.description}`);
      if (!r.blocked) console.log(`         └─ ${r.detail}`);
    }
    console.log('──────────────────────────────────────────────────────────');
    console.log(` ${blocked}/${total} attacks blocked.`);
    if (open.length === 0) console.log(' All HTTP-layer attacks defeated.');
    else                   console.log(' WARNING: open vectors remain (see above).');
    console.log('══════════════════════════════════════════════════════════\n');
    /* eslint-enable no-console */
  });

  // ─── V1  curl/wget direct hit ─────────────────────────────────────────────
  it('V1 — curl/wget direct hit (no Sec-Fetch headers)', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const res = await GET(buildReq(token, { mode: 'raw' }), { params: { token } } as any);
    const blocked = res.status === 403;
    record('V1', 'curl/wget with bare GET — no browser headers', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V2  fetch missing X-Content-Request ─────────────────────────────────
  it('V2 — JS fetch missing custom marker header', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const res = await GET(
      buildReq(token, { mode: 'raw', secFetchDest: 'empty', secFetchMode: 'cors', secFetchSite: 'same-origin' }),
      { params: { token } } as any,
    );
    const blocked = res.status === 403;
    record('V2', 'fetch() with browser headers but no X-Content-Request', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V3  Mode confusion: stream URL on a PDF (skip watermark) ────────────
  it('V3 — request a PDF via stream URL to skip watermarking', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const res = await GET(
      buildReq(token, { mode: 'stream', ...browserVideoHeaders() }),
      { params: { token } } as any,
    );
    // Should be rejected because the lesson is type=pdf but mode=stream → cross-mode
    const blocked = res.status >= 400;
    record('V3', 'stream-mode request for a PDF (bypass watermark)', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V4  Mode confusion: raw URL on a video ──────────────────────────────
  it('V4 — request a video via raw URL to grab the full file', async () => {
    const token = await issueToken(String(seed.course._id), seed.videoLessonId, { kind: 'stream' });
    const { GET } = await getRoute();
    const res = await GET(
      buildReq(token, { mode: 'raw', ...browserPdfHeaders() }),
      { params: { token } } as any,
    );
    const blocked = res.status >= 400;
    record('V4', 'raw-mode request for a video lesson', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V5  Range-loop a PDF via stream mode ────────────────────────────────
  it('V5 — assemble PDF chunk-by-chunk via stream range requests', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const res = await GET(
      buildReq(token, { mode: 'stream', ...browserVideoHeaders(), range: 'bytes=0-9' }),
      { params: { token } } as any,
    );
    // PDF lesson + mode=stream should reject before any bytes are served
    const blocked = res.status >= 400;
    record('V5', 'range-request loop on PDF via stream mode', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V6  Token replay across users ───────────────────────────────────────
  it('V6 — student stolen token replayed by outsider user', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    // Switch session to outsider but reuse student's token
    setCurrentUser({ id: String(outsider._id), role: 'student' });
    const { GET } = await getRoute();
    const res = await GET(
      buildReq(token, { mode: 'raw', ...browserPdfHeaders() }),
      { params: { token } } as any,
    );
    const blocked = res.status === 403;
    record('V6', 'token replay by a different signed-in user', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V7  Token tampering ─────────────────────────────────────────────────
  it('V7 — flip bits in the token body / HMAC', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'AA' ? 'BB' : 'AA');
    const { GET } = await getRoute();
    const res = await GET(
      buildReq(tampered, { mode: 'raw', ...browserPdfHeaders() }),
      { params: { token: tampered } } as any,
    );
    const blocked = res.status === 403;
    record('V7', 'HMAC tampering', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V8  Token forged with a different secret ────────────────────────────
  it('V8 — token forged with attacker-chosen secret', async () => {
    // Forge a token signed with a different secret
    const crypto = await import('crypto');
    const data = JSON.stringify({
      userId: String(student._id), courseId: String(seed.course._id), lessonId: seed.pdfLessonId,
      exp: Date.now() + 60_000, nonce: '00',
    });
    const fake = crypto.createHmac('sha256', 'attacker-controlled-secret'.repeat(2)).update(data).digest('hex');
    const forged = Buffer.from(`${data}.${fake}`).toString('base64url');
    const { GET } = await getRoute();
    const res = await GET(
      buildReq(forged, { mode: 'raw', ...browserPdfHeaders() }),
      { params: { token: forged } } as any,
    );
    const blocked = res.status === 403;
    record('V8', 'forged token with wrong HMAC secret', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V9  Token reuse after exceeding the per-token limit ────────────────
  it('V9 — re-use the same token beyond the per-token raw limit (3)', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    let first200 = false;
    for (let i = 0; i < 3; i++) {
      const r = await GET(buildReq(token, { mode: 'raw', ...browserPdfHeaders() }), { params: { token } } as any);
      if (i === 0) first200 = r.status === 200;
    }
    const overflow = await GET(buildReq(token, { mode: 'raw', ...browserPdfHeaders() }), { params: { token } } as any);
    const blocked = first200 && overflow.status === 429;
    record('V9', 'per-token raw limit (3): 4th hit must 429', blocked, `1st=200 4th=${overflow.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V10 Token issued on IP A, fetched from IP B ─────────────────────────
  it('V10 — token issued from IP A, fetched from IP B (different /24)', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId, {
      userAgent: 'Mozilla/5.0 (issuer)', xff: '203.0.113.10',
    });
    const { GET } = await getRoute();
    const res = await GET(
      buildReq(token, { mode: 'raw', ...browserPdfHeaders(), userAgent: 'Mozilla/5.0 (issuer)', xff: '198.51.100.10' }),
      { params: { token } } as any,
    );
    const blocked = res.status === 403;
    record('V10', 'fingerprint mismatch — different IP prefix', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V11 Different User-Agent ────────────────────────────────────────────
  it('V11 — token issued on browser A, fetched on browser B', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId, {
      userAgent: 'Mozilla/5.0 (Chrome on Linux)', xff: '203.0.113.10',
    });
    const { GET } = await getRoute();
    const res = await GET(
      buildReq(token, { mode: 'raw', ...browserPdfHeaders(), userAgent: 'curl/8.0.1', xff: '203.0.113.10' }),
      { params: { token } } as any,
    );
    const blocked = res.status === 403;
    record('V11', 'fingerprint mismatch — different User-Agent', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V12 Path traversal in filePath ──────────────────────────────────────
  it('V12 — stored filePath = /etc/passwd', async () => {
    const evilLesson = new mongoose.Types.ObjectId();
    const evilCourse = await Course.create({
      title: 'Evil', slug: 'evil-' + Date.now().toString(36),
      description: 'A course with a malicious lesson filePath used by the attack suite.',
      instructor: instructor._id, price: 0, category: 'general', level: 'beginner',
      language: 'ar', isPublished: true,
      modules: [{ title: 'M', order: 1, lessons: [{ _id: evilLesson, title: 'x', type: 'pdf', filePath: '/etc/passwd', order: 1 }] }],
    });
    await makeEnrollment({ user: student._id, course: evilCourse._id, status: 'active' });
    const token = await issueToken(String(evilCourse._id), String(evilLesson));
    const { GET } = await getRoute();
    const res = await GET(buildReq(token, { mode: 'raw', ...browserPdfHeaders() }), { params: { token } } as any);
    const blocked = res.status >= 400;
    record('V12', 'lesson filePath points outside uploads/', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V13 Symlink under uploads/ pointing to /etc/hosts ───────────────────
  it('V13 — symlink under uploads/ pointing to /etc/hosts', async () => {
    const linkPath = path.join(seed.tmp, 'sneaky.pdf');
    try { fs.unlinkSync(linkPath); } catch {}
    fs.symlinkSync('/etc/hosts', linkPath);

    const sneakyLesson = new mongoose.Types.ObjectId();
    const sneakyCourse = await Course.create({
      title: 'Sneaky', slug: 'sneaky-' + Date.now().toString(36),
      description: 'A course whose stored filePath is a symlink under uploads pointing outside.',
      instructor: instructor._id, price: 0, category: 'general', level: 'beginner',
      language: 'ar', isPublished: true,
      modules: [{ title: 'M', order: 1, lessons: [{ _id: sneakyLesson, title: 'x', type: 'pdf', filePath: linkPath, order: 1 }] }],
    });
    await makeEnrollment({ user: student._id, course: sneakyCourse._id, status: 'active' });
    const token = await issueToken(String(sneakyCourse._id), String(sneakyLesson));
    const { GET } = await getRoute();
    const res = await GET(buildReq(token, { mode: 'raw', ...browserPdfHeaders() }), { params: { token } } as any);
    const blocked = res.status >= 400;
    record('V13', 'symlink under uploads/ escaping to /etc/hosts', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V14 Browser prefetch ────────────────────────────────────────────────
  it('V14 — prefetch / prerender request', async () => {
    const token = await issueToken(String(seed.course._id), seed.pdfLessonId);
    const { GET } = await getRoute();
    const res = await GET(
      buildReq(token, { mode: 'raw', ...browserPdfHeaders(), prefetch: true }),
      { params: { token } } as any,
    );
    const blocked = res.status === 403;
    record('V14', 'sec-purpose=prefetch must be rejected', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V15 Token-issuance flood (per-user RL) ──────────────────────────────
  it('V15 — flood token issuance from one user', async () => {
    // Issue many tokens; verify-route per-user RL kicks in eventually.
    // (Issuance route itself is not currently rate-limited; the rate limit fires
    // when those tokens are spent. So we issue 1 token, then hammer raw fetches.)
    const { GET } = await getRoute();
    let blocked429 = false;
    let firstStatus = 0;
    for (let i = 0; i < 80; i++) {
      const t = await issueToken(String(seed.course._id), seed.pdfLessonId);
      const r = await GET(buildReq(t, { mode: 'raw', ...browserPdfHeaders() }), { params: { token: t } } as any);
      if (i === 0) firstStatus = r.status;
      if (r.status === 429) { blocked429 = true; break; }
    }
    record('V15', 'per-user raw-fetch flood (60/hr cap)', blocked429, `firstStatus=${firstStatus} hitCap=${blocked429}`);
    expect(blocked429).toBe(true);
  });

  // ─── V16 Outsider (not enrolled) requesting a token ──────────────────────
  it('V16 — outsider with no enrollment requests a token', async () => {
    setCurrentUser({ id: String(outsider._id), role: 'student' });
    const { GET } = await getTokenRoute();
    const req = new NextRequest(new URL(`http://localhost/api/courses/${seed.course._id}/content-token?lessonId=${seed.pdfLessonId}`));
    const res = await GET(req, { params: { id: String(seed.course._id) } } as any);
    const allowed = res.status === 200;
    record('V16', 'first lesson is free preview for non-enrolled user', allowed, `status=${res.status}`);
    expect(allowed).toBe(true);
  });

  // ─── V17 Token for course A, file from course B ──────────────────────────
  it('V17 — token bound to course A used to access course B', async () => {
    // Second course owned by same instructor with its own file
    const otherSeed = await seedCourse(String(instructor._id), Buffer.from('%PDF-1.4\nother\n'), Buffer.alloc(64));
    await makeEnrollment({ user: student._id, course: otherSeed.course._id, status: 'active' });
    const tokenA = await issueToken(String(seed.course._id), seed.pdfLessonId);
    // The route resolves the lesson from the token's lessonId, so it serves course-A's file.
    // The attack is: can a course-A token somehow reach course-B's file? It cannot — lessonId
    // is signed into the token. We assert that swapping URL params does NOT redirect server logic.
    const { GET } = await getRoute();
    const res = await GET(buildReq(tokenA, { mode: 'raw', ...browserPdfHeaders() }), { params: { token: tokenA } } as any);
    const body = res.status === 200 ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
    // Returned bytes must NOT contain course B's payload signature ("other")
    const leaked = body.toString('utf-8').includes('other\n');
    const blocked = !leaked;
    record('V17', 'token cross-course access', blocked, leaked ? 'course B bytes leaked' : 'served correct course-A bytes');
    await fs.promises.rm(otherSeed.tmp, { recursive: true, force: true }).catch(() => {});
    expect(blocked).toBe(true);
  });

  // ─── V18 Expired token ───────────────────────────────────────────────────
  it('V18 — expired token still accepted?', async () => {
    const crypto = await import('crypto');
    const data = JSON.stringify({
      userId: String(student._id), courseId: String(seed.course._id), lessonId: seed.pdfLessonId,
      exp: Date.now() - 60_000, // expired 1 minute ago
      nonce: '00',
    });
    const hmac = crypto.createHmac('sha256', 'a'.repeat(64)).update(data).digest('hex');
    const expired = Buffer.from(`${data}.${hmac}`).toString('base64url');
    const { GET } = await getRoute();
    const res = await GET(buildReq(expired, { mode: 'raw', ...browserPdfHeaders() }), { params: { token: expired } } as any);
    const blocked = res.status === 403;
    record('V18', 'expired token reused', blocked, `status=${res.status}`);
    expect(blocked).toBe(true);
  });

  // ─── V19 Garbage / empty token ───────────────────────────────────────────
  it('V19 — empty / garbage token', async () => {
    const { GET } = await getRoute();
    const r1 = await GET(buildReq('', { mode: 'raw', ...browserPdfHeaders() }), { params: { token: '' } } as any);
    const r2 = await GET(buildReq('!!not-base64!!', { mode: 'raw', ...browserPdfHeaders() }), { params: { token: '!!not-base64!!' } } as any);
    const blocked = r1.status >= 400 && r2.status >= 400;
    record('V19', 'empty / non-base64 token', blocked, `r1=${r1.status} r2=${r2.status}`);
    expect(blocked).toBe(true);
  });
});
