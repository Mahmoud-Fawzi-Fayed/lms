/**
 * Integration tests — GET /api/courses/[id]/content-token
 *
 * Pentest/QA focus:
 *  - Auth required
 *  - Lesson must exist in the course (no IDOR via random lessonId)
 *  - First lesson auto-marked as preview (no enrollment needed)
 *  - Explicit isPreview lessons available without enrollment
 *  - Non-enrolled student blocked on non-preview / non-first lessons
 *  - Year-mismatch student blocked
 *  - Course owner / admin always allowed
 *  - kind=raw rejected for video lesson; kind=stream rejected for pdf lesson
 *  - 409 when lesson type=video/pdf has no uploaded filePath
 *  - Per-IP and per-user issuance rate limits
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { makeUser, makeEnrollment } from './factories';
import { setCurrentUser, clearCurrentUser } from './auth-mock';
import { Course } from '@/models';
import mongoose from 'mongoose';

async function tokenApi() { return import('@/app/api/courses/[id]/content-token/route'); }

const ctx = (id: string) => ({ params: { id } } as any);
function tokenReq(courseId: string, qs: string, ip = '10.0.0.1', ua = 'Test/UA') {
  const url = `http://localhost/api/courses/${courseId}/content-token?${qs}`;
  return new NextRequest(new URL(url), {
    headers: {
      'x-forwarded-for': ip,
      'user-agent': ua,
    },
  });
}

async function buildCourseWithLessons(opts: {
  instructor: any; targetYear?: string;
}) {
  // Module 0: video, video, pdf (the LAST lesson is the only PDF)
  // Lesson L0 is the implicit "first lesson preview"; L1 is private; L2 is private.
  const m0 = {
    title: 'M0', order: 0,
    lessons: [
      { _id: new mongoose.Types.ObjectId(), title: 'L0-video', type: 'video', order: 0, duration: 60, filePath: '/uploads/v0.mp4' },
      { _id: new mongoose.Types.ObjectId(), title: 'L1-video', type: 'video', order: 1, duration: 60, filePath: '/uploads/v1.mp4' },
      { _id: new mongoose.Types.ObjectId(), title: 'L2-pdf',   type: 'pdf',   order: 2, filePath: '/uploads/d.pdf' },
      { _id: new mongoose.Types.ObjectId(), title: 'L3-video-empty', type: 'video', order: 3 /* no filePath */ },
      { _id: new mongoose.Types.ObjectId(), title: 'L4-explicit-preview', type: 'video', order: 4, isPreview: true, filePath: '/uploads/v4.mp4' },
    ],
  };
  const c = await Course.create({
    title: 'T-CT-' + Date.now(),
    slug:  't-ct-' + Date.now(),
    description: 'description with the right length',
    instructor: opts.instructor,
    price: 0,
    category: 'general',
    level: 'beginner',
    language: 'ar',
    targetYear: opts.targetYear,
    isPublished: true,
    modules: [m0],
  });
  const ids = m0.lessons.map(l => String(l._id));
  return { course: c, lessonIds: { firstVideo: ids[0], secondVideo: ids[1], pdf: ids[2], emptyVideo: ids[3], explicitPreview: ids[4] } };
}

describe('GET /api/courses/[id]/content-token', () => {
  let owner: any, otherInstr: any, admin: any, student: any, otherStudent: any;
  let course: any, lessonIds: any;

  beforeEach(async () => {
    owner = await makeUser({ role: 'instructor' });
    otherInstr = await makeUser({ role: 'instructor' });
    admin = await makeUser({ role: 'admin' });
    student = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    otherStudent = await makeUser({ role: 'student', academicYear: 'grade2_secondary' });
    const built = await buildCourseWithLessons({ instructor: owner._id, targetYear: 'grade1_secondary' });
    course = built.course;
    lessonIds = built.lessonIds;
  });

  it('rejects unauthenticated', async () => {
    clearCurrentUser();
    const { GET } = await tokenApi();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${lessonIds.firstVideo}&kind=stream`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when lessonId is missing', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await tokenApi();
    const res = await GET(tokenReq(String(course._id), ''), ctx(String(course._id)));
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown course', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await tokenApi();
    const ghost = '507f1f77bcf86cd799439011';
    const res = await GET(
      tokenReq(ghost, `lessonId=${lessonIds.firstVideo}&kind=stream`),
      ctx(ghost),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for a lessonId that does not belong to the course', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await tokenApi();
    const ghostLesson = new mongoose.Types.ObjectId().toString();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${ghostLesson}&kind=stream`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(404);
  });

  it('non-enrolled student gets a token for the FIRST lesson (auto preview)', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await tokenApi();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${lessonIds.firstVideo}&kind=stream`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.data.token).toBe('string');
  });

  it('non-enrolled student gets a token for an EXPLICIT preview lesson', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await tokenApi();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${lessonIds.explicitPreview}&kind=stream`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(200);
  });

  it('CRITICAL: non-enrolled student is blocked from a non-preview lesson', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await tokenApi();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${lessonIds.secondVideo}&kind=stream`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(403);
  });

  it('enrolled student CAN request token for any lesson', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await tokenApi();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${lessonIds.secondVideo}&kind=stream`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(200);
  });

  it('CRITICAL: a student from a different academic year is blocked (course year-gated)', async () => {
    setCurrentUser({ id: String(otherStudent._id), role: 'student', academicYear: 'grade2_secondary' });
    const { GET } = await tokenApi();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${lessonIds.firstVideo}&kind=stream`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(403);
  });

  it('course owner ALWAYS gets a token (no enrollment needed)', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { GET } = await tokenApi();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${lessonIds.secondVideo}&kind=stream`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(200);
  });

  it('a non-owning instructor is treated as a normal user (blocked on locked lessons)', async () => {
    setCurrentUser({ id: String(otherInstr._id), role: 'instructor' });
    const { GET } = await tokenApi();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${lessonIds.secondVideo}&kind=stream`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(403);
  });

  it('admin ALWAYS gets a token', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await tokenApi();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${lessonIds.secondVideo}&kind=stream`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(200);
  });

  // ── Mode/Type binding ────────────────────────────────────────────────────
  it('CRITICAL: kind=raw is rejected for a video lesson (cross-mode attack surface)', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { GET } = await tokenApi();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${lessonIds.secondVideo}&kind=raw`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(400);
  });

  it('CRITICAL: kind=stream is rejected for a pdf lesson', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { GET } = await tokenApi();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${lessonIds.pdf}&kind=stream`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(400);
  });

  it('returns 409 when video/pdf lesson has no uploaded filePath yet', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { GET } = await tokenApi();
    const res = await GET(
      tokenReq(String(course._id), `lessonId=${lessonIds.emptyVideo}&kind=stream`),
      ctx(String(course._id)),
    );
    expect(res.status).toBe(409);
  });

  // ── Issuance rate limiting ───────────────────────────────────────────────
  it('per-IP rate limit triggers 429 after the burst (60/min)', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { GET } = await tokenApi();

    // Each call uses the same IP. Owner can request many tokens, but per-IP cap is 60.
    let saw429 = false;
    for (let i = 0; i < 65; i++) {
      const res = await GET(
        tokenReq(String(course._id), `lessonId=${lessonIds.firstVideo}&kind=stream`, '203.0.113.1'),
        ctx(String(course._id)),
      );
      if (res.status === 429) { saw429 = true; break; }
    }
    expect(saw429).toBe(true);
  });
});
