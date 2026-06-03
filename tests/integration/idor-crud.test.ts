/**
 * Integration tests — IDOR / authorization / privilege escalation on CRUD endpoints.
 *
 * Endpoints under test:
 *   PUT  /api/courses/[id]
 *   DEL  /api/courses/[id]
 *   GET  /api/courses/[id]   (sanitization & enrollment-based content gating)
 *   PUT  /api/exams/[id]
 *   DEL  /api/exams/[id]
 *   POST /api/courses        (creation always pinned to caller as instructor)
 *
 * Pentest concerns:
 *  - Non-owner instructor cannot edit/delete another's course or exam
 *  - Admin can do anything
 *  - filePath / fileUrl injection in PUT body is stripped (would leak peer files)
 *  - videoControls injection rejected
 *  - Course delete blocked when active enrollments exist
 *  - Exam re-parenting (`course` field) requires ownership of new course
 *  - Exam create on a course you don't own → 403
 *  - Course detail strips lesson content / filePath for non-enrolled users
 *  - Course detail does NOT leak draft course to other instructors
 *  - POST /api/courses cannot inject `instructor` (privilege/ownership injection)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { makeUser, makeCourse, makeEnrollment, makeExam } from './factories';
import { setCurrentUser, mockRequest } from './auth-mock';
import { Course, Exam, Enrollment } from '@/models';

async function courseDetailApi() { return import('@/app/api/courses/[id]/route'); }
async function coursesApi() { return import('@/app/api/courses/route'); }
async function examDetailApi() { return import('@/app/api/exams/[id]/route'); }

function jsonReq(url: string, method: 'PUT'|'POST'|'DELETE', body?: any) {
  const init: any = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, 'http://localhost'), init);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/courses/[id] — ownership & body sanitization', () => {
  let owner: any, otherInst: any, admin: any, student: any;
  let course: any, lessonId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    owner = await makeUser({ role: 'instructor' });
    otherInst = await makeUser({ role: 'instructor' });
    admin = await makeUser({ role: 'admin' });
    student = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    lessonId = new mongoose.Types.ObjectId();
    course = await Course.create({
      title: 'CRUD course',
      slug: 'crud-' + Date.now().toString(36),
      description: 'Course used for IDOR tests with sufficient description length to validate.',
      instructor: owner._id, price: 100, category: 'math', level: 'beginner',
      language: 'ar', isPublished: true, targetYear: 'grade1_secondary',
      modules: [{
        title: 'M', order: 1,
        lessons: [{
          _id: lessonId, title: 'L', type: 'video', order: 1,
          filePath: '/tmp/uploads/videos/secret.mp4', // server-managed
          fileUrl: 'uploaded',
          videoControls: { allowSpeed: true, allowSkip: true, allowFullscreen: true, allowSeek: true, allowVolume: true, forceFocus: false },
        }],
      }],
    });
  });

  it('non-owner instructor cannot update course (403)', async () => {
    setCurrentUser({ id: String(otherInst._id), role: 'instructor' });
    const { PUT } = await courseDetailApi();
    const res = await PUT(jsonReq(`/api/courses/${course._id}`, 'PUT', { title: 'STOLEN' }));
    expect(res.status).toBe(403);
    const fresh = await Course.findById(course._id);
    expect(fresh?.title).toBe('CRUD course');
  });

  it('student cannot update course (403, role gate)', async () => {
    setCurrentUser({ id: String(student._id), role: 'student' });
    const { PUT } = await courseDetailApi();
    const res = await PUT(jsonReq(`/api/courses/${course._id}`, 'PUT', { title: 'STOLEN' }));
    expect(res.status).toBe(403);
  });

  it('owner can update course title', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PUT } = await courseDetailApi();
    const res = await PUT(jsonReq(`/api/courses/${course._id}`, 'PUT', { title: 'New Title' }));
    expect(res.status).toBe(200);
    const fresh = await Course.findById(course._id);
    expect(fresh?.title).toBe('New Title');
  });

  it('admin can update any course', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await courseDetailApi();
    const res = await PUT(jsonReq(`/api/courses/${course._id}`, 'PUT', { title: 'Admin renamed' }));
    expect(res.status).toBe(200);
  });

  it('rejects invalid course id format', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PUT } = await courseDetailApi();
    const res = await PUT(jsonReq('/api/courses/not-an-id', 'PUT', { title: 'x' }));
    expect(res.status).toBe(400);
  });

  it('CRITICAL: filePath injection in modules body is silently stripped (preserves real path)', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PUT } = await courseDetailApi();
    const res = await PUT(jsonReq(`/api/courses/${course._id}`, 'PUT', {
      modules: [{
        title: 'M', order: 1,
        lessons: [{
          _id: lessonId, title: 'L', type: 'video', order: 1,
          // Attacker tries to redirect the lesson at a peer's protected file:
          filePath: '/tmp/uploads/videos/peers-secret.mp4',
          fileUrl: 'attacker-injected-url',
        }],
      }],
    }));
    expect(res.status).toBe(200);
    const fresh = await Course.findById(course._id).select('+modules.lessons.filePath').lean() as any;
    const lesson = fresh.modules[0].lessons[0];
    expect(lesson.filePath).toBe('/tmp/uploads/videos/secret.mp4');
    expect(lesson.fileUrl).toBe('uploaded');
  });

  it('CRITICAL: videoControls injection is preserved from server state, not body', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PUT } = await courseDetailApi();
    const res = await PUT(jsonReq(`/api/courses/${course._id}`, 'PUT', {
      modules: [{
        title: 'M', order: 1,
        lessons: [{
          _id: lessonId, title: 'L', type: 'video', order: 1,
          videoControls: { allowSpeed: false, allowSkip: false, forceFocus: true, hostileObject: { evil: true } },
        }],
      }],
    }));
    expect(res.status).toBe(200);
    const fresh = await Course.findById(course._id).lean() as any;
    const vc = fresh.modules[0].lessons[0].videoControls;
    // Original server-side videoControls preserved
    expect(vc.allowSpeed).toBe(true);
    expect(vc.forceFocus).toBe(false);
    expect(vc.hostileObject).toBeUndefined();
  });

  it('discountPrice >= price is dropped (cannot set free-via-discount via PUT)', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PUT } = await courseDetailApi();
    const res = await PUT(jsonReq(`/api/courses/${course._id}`, 'PUT', {
      price: 100, discountPrice: 999,
    }));
    expect(res.status).toBe(200);
    const fresh = await Course.findById(course._id);
    expect(fresh?.discountPrice).toBeUndefined();
  });

  it('setting price to 0 unsets discountPrice', async () => {
    await Course.findByIdAndUpdate(course._id, { discountPrice: 50 });
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PUT } = await courseDetailApi();
    const res = await PUT(jsonReq(`/api/courses/${course._id}`, 'PUT', { price: 0 }));
    expect(res.status).toBe(200);
    const fresh = await Course.findById(course._id);
    expect(fresh?.price).toBe(0);
    expect(fresh?.discountPrice).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/courses/[id] — ownership & enrollment guard', () => {
  let owner: any, otherInst: any, admin: any, student: any;
  let course: any;

  beforeEach(async () => {
    owner = await makeUser({ role: 'instructor' });
    otherInst = await makeUser({ role: 'instructor' });
    admin = await makeUser({ role: 'admin' });
    student = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    course = await makeCourse({ instructor: owner._id, price: 100, isPublished: true, targetYear: 'grade1_secondary' });
  });

  it('non-owner instructor cannot delete (403)', async () => {
    setCurrentUser({ id: String(otherInst._id), role: 'instructor' });
    const { DELETE } = await courseDetailApi();
    const res = await DELETE(jsonReq(`/api/courses/${course._id}`, 'DELETE'));
    expect(res.status).toBe(403);
    expect(await Course.findById(course._id)).toBeTruthy();
  });

  it('student cannot delete (role gate, 403)', async () => {
    setCurrentUser({ id: String(student._id), role: 'student' });
    const { DELETE } = await courseDetailApi();
    const res = await DELETE(jsonReq(`/api/courses/${course._id}`, 'DELETE'));
    expect(res.status).toBe(403);
  });

  it('owner blocked when active enrollments exist', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { DELETE } = await courseDetailApi();
    const res = await DELETE(jsonReq(`/api/courses/${course._id}`, 'DELETE'));
    expect(res.status).toBe(400);
    expect(await Course.findById(course._id)).toBeTruthy();
  });

  it('owner can delete with no enrollments', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { DELETE } = await courseDetailApi();
    const res = await DELETE(jsonReq(`/api/courses/${course._id}`, 'DELETE'));
    expect(res.status).toBe(200);
    expect(await Course.findById(course._id)).toBeNull();
  });

  it('admin can delete any course (no enrollments)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { DELETE } = await courseDetailApi();
    const res = await DELETE(jsonReq(`/api/courses/${course._id}`, 'DELETE'));
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/courses — creation pin', () => {
  let inst: any, otherInst: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    otherInst = await makeUser({ role: 'instructor' });
  });

  it('CRITICAL: ignores any injected `instructor` field — pinned to caller', async () => {
    setCurrentUser({ id: String(inst._id), role: 'instructor' });
    const { POST } = await coursesApi();
    const res = await POST(jsonReq('/api/courses', 'POST', {
      title: 'Pinned course',
      description: 'A course with sufficient description length to satisfy validation.',
      price: 0, category: 'math', level: 'beginner', language: 'ar',
      instructor: String(otherInst._id), // injection attempt
    }) as any);
    expect(res.status).toBe(201);
    const fresh = await Course.findOne({ title: 'Pinned course' });
    expect(String(fresh?.instructor)).toBe(String(inst._id));
  });

  it('rejects body missing required fields (400)', async () => {
    setCurrentUser({ id: String(inst._id), role: 'instructor' });
    const { POST } = await coursesApi();
    const res = await POST(jsonReq('/api/courses', 'POST', { title: 'x' }) as any);
    expect(res.status).toBe(400);
  });

  it('students cannot create courses (403)', async () => {
    const stu = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(stu._id), role: 'student' });
    const { POST } = await coursesApi();
    const res = await POST(jsonReq('/api/courses', 'POST', {
      title: 'Hack',
      description: 'Should be rejected by withAuth role guard, not reach validation.',
      price: 0, category: 'math', level: 'beginner', language: 'ar',
    }) as any);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/courses/[id] — sanitization', () => {
  let inst: any, otherInst: any, student: any;
  let course: any, lessonId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    otherInst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    lessonId = new mongoose.Types.ObjectId();
    course = await Course.create({
      title: 'Detail course',
      slug: 'detail-' + Date.now().toString(36),
      description: 'Course used for detail-route sanitization tests with proper length.',
      instructor: inst._id, price: 0, category: 'math', level: 'beginner',
      language: 'ar', isPublished: true, targetYear: 'grade1_secondary',
      modules: [
        { title: 'M', order: 1, lessons: [
          { _id: lessonId, title: 'first', type: 'text', content: 'free-content', order: 1 },
          { title: 'second', type: 'text', content: 'paid-content', order: 2 },
        ] },
      ],
    });
  });

  it('non-enrolled student does not see lesson content of paid (non-first / non-preview) lesson', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await courseDetailApi();
    const res = await GET(
      new NextRequest(new URL(`http://localhost/api/courses/${course._id}`)),
      { params: { id: String(course._id) } } as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const blob = JSON.stringify(json);
    expect(blob).not.toContain('paid-content');
    // First lesson should be marked as free
    const firstLesson = json.data.course.modules[0].lessons[0];
    expect(firstLesson.isFreeLesson).toBe(true);
    expect(firstLesson.content).toBe('free-content');
    // No filePath ever
    expect(blob).not.toContain('filePath');
  });

  it('enrolled student sees content of all lessons', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await courseDetailApi();
    const res = await GET(
      new NextRequest(new URL(`http://localhost/api/courses/${course._id}`)),
      { params: { id: String(course._id) } } as any,
    );
    const json = await res.json();
    const blob = JSON.stringify(json);
    expect(blob).toContain('paid-content');
    expect(json.data.isEnrolled).toBe(true);
  });

  it('non-owner instructor sees draft course as 404', async () => {
    await Course.findByIdAndUpdate(course._id, { isPublished: false });
    setCurrentUser({ id: String(otherInst._id), role: 'instructor' });
    const { GET } = await courseDetailApi();
    const res = await GET(
      new NextRequest(new URL(`http://localhost/api/courses/${course._id}`)),
      { params: { id: String(course._id) } } as any,
    );
    expect(res.status).toBe(404);
  });

  it('course owner can view their own draft', async () => {
    await Course.findByIdAndUpdate(course._id, { isPublished: false });
    setCurrentUser({ id: String(inst._id), role: 'instructor' });
    const { GET } = await courseDetailApi();
    const res = await GET(
      new NextRequest(new URL(`http://localhost/api/courses/${course._id}`)),
      { params: { id: String(course._id) } } as any,
    );
    expect(res.status).toBe(200);
  });

  // REGRESSION (Bug-fix E): mongoose.Types.ObjectId.isValid accepts ANY 12-byte
  // string. A slug shaped like 12 ASCII chars used to mis-route into the _id
  // branch and could surface unintended documents. The route now uses a strict
  // 24-hex regex.
  it('REGRESSION: a 12-char ASCII id is treated as slug, not as ObjectId', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await courseDetailApi();
    const fakeId = 'abc123xyz!@#'; // 12 chars, not hex
    const res = await GET(
      new NextRequest(new URL(`http://localhost/api/courses/${encodeURIComponent(fakeId)}`)),
      { params: { id: fakeId } } as any,
    );
    // Treated as slug → no match → 404 (not an unhandled ObjectId cast error).
    expect(res.status).toBe(404);
  });

  it('lookup by slug works the same as by id', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await courseDetailApi();
    const res = await GET(
      new NextRequest(new URL(`http://localhost/api/courses/${course.slug}`)),
      { params: { id: course.slug } } as any,
    );
    expect(res.status).toBe(200);
  });

  it('student of wrong year is rejected with 403', async () => {
    const otherStu = await makeUser({ role: 'student', academicYear: 'grade2_secondary' });
    setCurrentUser({ id: String(otherStu._id), role: 'student', academicYear: 'grade2_secondary' });
    const { GET } = await courseDetailApi();
    const res = await GET(
      new NextRequest(new URL(`http://localhost/api/courses/${course._id}`)),
      { params: { id: String(course._id) } } as any,
    );
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/exams/[id] — ownership, re-parenting, pricing rules', () => {
  let owner: any, otherInst: any;
  let courseOwn: any, coursePeer: any, exam: any;

  beforeEach(async () => {
    owner = await makeUser({ role: 'instructor' });
    otherInst = await makeUser({ role: 'instructor' });
    courseOwn = await makeCourse({ instructor: owner._id, isPublished: true });
    coursePeer = await makeCourse({ instructor: otherInst._id, isPublished: true });
    exam = await makeExam({ createdBy: owner._id, accessType: 'paid', price: 50 });
  });

  it('non-owner cannot update', async () => {
    setCurrentUser({ id: String(otherInst._id), role: 'instructor' });
    const { PUT } = await examDetailApi();
    const res = await PUT(jsonReq(`/api/exams/${exam._id}`, 'PUT', { title: 'STOLEN' }));
    expect(res.status).toBe(403);
  });

  it('CRITICAL: cannot re-parent exam under another instructor\'s course (403)', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PUT } = await examDetailApi();
    const res = await PUT(jsonReq(`/api/exams/${exam._id}`, 'PUT', {
      course: String(coursePeer._id),
    }));
    expect(res.status).toBe(403);
    const fresh = await Exam.findById(exam._id);
    expect(fresh?.course).toBeFalsy();
  });

  it('owner CAN re-parent under their OWN course; this also forces accessType=free, price=0', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PUT } = await examDetailApi();
    const res = await PUT(jsonReq(`/api/exams/${exam._id}`, 'PUT', {
      course: String(courseOwn._id),
    }));
    expect(res.status).toBe(200);
    const fresh = await Exam.findById(exam._id);
    expect(String(fresh?.course)).toBe(String(courseOwn._id));
    expect(fresh?.accessType).toBe('free');
    expect(fresh?.price).toBe(0);
  });

  it('paid standalone with price <= 0 is rejected', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PUT } = await examDetailApi();
    const res = await PUT(jsonReq(`/api/exams/${exam._id}`, 'PUT', { price: 0, accessType: 'paid' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid id format', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PUT } = await examDetailApi();
    const res = await PUT(jsonReq('/api/exams/bad', 'PUT', { title: 'x' }));
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/exams/[id] — ownership & cascade', () => {
  let owner: any, otherInst: any, admin: any, student: any;
  let exam: any;

  beforeEach(async () => {
    owner = await makeUser({ role: 'instructor' });
    otherInst = await makeUser({ role: 'instructor' });
    admin = await makeUser({ role: 'admin' });
    student = await makeUser({ role: 'student' });
    exam = await makeExam({ createdBy: owner._id });
    // Pre-existing attempts that must be deleted on cascade
    const { ExamAttempt, ExamEnrollment } = await import('@/models');
    await ExamAttempt.create({
      user: student._id, exam: exam._id, attemptNumber: 1, status: 'submitted',
      score: 50, totalPoints: 1, earnedPoints: 0, passed: false,
    });
    await ExamEnrollment.create({ user: student._id, exam: exam._id, status: 'active' });
  });

  it('non-owner cannot delete', async () => {
    setCurrentUser({ id: String(otherInst._id), role: 'instructor' });
    const { DELETE } = await examDetailApi();
    const res = await DELETE(jsonReq(`/api/exams/${exam._id}`, 'DELETE'));
    expect(res.status).toBe(403);
  });

  it('owner deletes exam and cascades attempts + enrollments', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { DELETE } = await examDetailApi();
    const res = await DELETE(jsonReq(`/api/exams/${exam._id}`, 'DELETE'));
    expect(res.status).toBe(200);
    const { ExamAttempt, ExamEnrollment } = await import('@/models');
    expect(await Exam.findById(exam._id)).toBeNull();
    expect(await ExamAttempt.countDocuments({ exam: exam._id })).toBe(0);
    expect(await ExamEnrollment.countDocuments({ exam: exam._id })).toBe(0);
  });

  it('admin deletes any exam', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { DELETE } = await examDetailApi();
    const res = await DELETE(jsonReq(`/api/exams/${exam._id}`, 'DELETE'));
    expect(res.status).toBe(200);
  });
});
