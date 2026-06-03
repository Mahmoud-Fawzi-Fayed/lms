/**
 * Integration tests — enrollments + user profile.
 *
 * Endpoints:
 *   GET  /api/enrollments
 *   POST /api/enrollments         (lesson progress)
 *   GET  /api/users/me
 *   PUT  /api/users/me            (profile + password change)
 *   DEL  /api/users/me            (registration rollback only)
 *
 * Pentest concerns:
 *  - Enrollments scoping: user only sees own
 *  - Progress requires active enrollment, valid lessonId belonging to course
 *  - Invalid ObjectIds → 400; non-existent course → 404
 *  - Year mismatch on progress → 403
 *  - Cannot mark a lesson from a DIFFERENT course as completed
 *  - users/me hides password
 *  - users/me PUT validates phone format, avatar URL scheme
 *  - Password change requires current password; reject same-as-current; reject weak
 *  - Avatar javascript: / data: scheme rejected (XSS)
 *  - DELETE /api/users/me allowed only within 5 minutes of creation AND no payments/enrollments
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { makeUser, makeCourse, makeEnrollment, makePayment } from './factories';
import { setCurrentUser, mockRequest } from './auth-mock';
import { Course, Enrollment, User } from '@/models';

async function enrollmentsApi() { return import('@/app/api/enrollments/route'); }
async function meApi() { return import('@/app/api/users/me/route'); }

function jsonReq(url: string, method: 'POST'|'PUT'|'DELETE', body?: any) {
  const init: any = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, 'http://localhost'), init);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/enrollments — own-scope listing', () => {
  let inst: any, alice: any, bob: any;
  let courseA: any, courseB: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    alice = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    bob = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    courseA = await makeCourse({ instructor: inst._id, isPublished: true });
    courseB = await makeCourse({ instructor: inst._id, isPublished: true });
    await makeEnrollment({ user: alice._id, course: courseA._id, status: 'active' });
    await makeEnrollment({ user: alice._id, course: courseB._id, status: 'pending' });
    await makeEnrollment({ user: bob._id,   course: courseA._id, status: 'active' });
  });

  it('rejects unauthenticated', async () => {
    setCurrentUser(null);
    const { GET } = await enrollmentsApi();
    const res = await GET(mockRequest('/api/enrollments') as any);
    expect(res.status).toBe(401);
  });

  it('alice sees only her ACTIVE enrollments', async () => {
    setCurrentUser({ id: String(alice._id), role: 'student' });
    const { GET } = await enrollmentsApi();
    const res = await GET(mockRequest('/api/enrollments') as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.enrollments).toHaveLength(1);
    expect(String(json.data.enrollments[0].course._id)).toBe(String(courseA._id));
  });

  it('bob never sees alice\'s enrollments', async () => {
    setCurrentUser({ id: String(bob._id), role: 'student' });
    const { GET } = await enrollmentsApi();
    const res = await GET(mockRequest('/api/enrollments') as any);
    const json = await res.json();
    const ids = json.data.enrollments.map((e: any) => String(e.user));
    for (const id of ids) expect(id).toBe(String(bob._id));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/enrollments — lesson progress integrity', () => {
  let inst: any, student: any, otherStudent: any;
  let course: any, otherCourse: any;
  let lessonId: mongoose.Types.ObjectId;
  let lessonInOtherCourse: mongoose.Types.ObjectId;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    otherStudent = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    lessonId = new mongoose.Types.ObjectId();
    lessonInOtherCourse = new mongoose.Types.ObjectId();
    course = await Course.create({
      title: 'Progress course',
      slug: 'progress-' + Date.now().toString(36),
      description: 'Course used for progress tests with sufficient description length.',
      instructor: inst._id, price: 0, category: 'math', level: 'beginner',
      language: 'ar', isPublished: true, targetYear: 'grade1_secondary',
      modules: [{
        title: 'M', order: 1,
        lessons: [
          { _id: lessonId, title: 'L1', type: 'text', content: 'a', order: 1 },
          { title: 'L2', type: 'text', content: 'b', order: 2 },
        ],
      }],
    });
    otherCourse = await Course.create({
      title: 'Other course',
      slug: 'other-' + Date.now().toString(36),
      description: 'Other course for cross-course progress test with sufficient description.',
      instructor: inst._id, price: 0, category: 'math', level: 'beginner',
      language: 'ar', isPublished: true, targetYear: 'grade1_secondary',
      modules: [{
        title: 'M', order: 1,
        lessons: [{ _id: lessonInOtherCourse, title: 'X', type: 'text', content: 'x', order: 1 }],
      }],
    });
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
  });

  it('rejects unauthenticated', async () => {
    setCurrentUser(null);
    const { POST } = await enrollmentsApi();
    const res = await POST(jsonReq('/api/enrollments', 'POST', {
      courseId: String(course._id), lessonId: String(lessonId),
    }));
    expect(res.status).toBe(401);
  });

  it('rejects invalid ObjectIds with 400', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await enrollmentsApi();
    const res = await POST(jsonReq('/api/enrollments', 'POST', { courseId: 'x', lessonId: 'y' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when courseId does not exist', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await enrollmentsApi();
    const res = await POST(jsonReq('/api/enrollments', 'POST', {
      courseId: new mongoose.Types.ObjectId().toString(),
      lessonId: String(lessonId),
    }));
    expect(res.status).toBe(404);
  });

  it('CRITICAL: lessonId from a DIFFERENT course is rejected (404)', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await enrollmentsApi();
    const res = await POST(jsonReq('/api/enrollments', 'POST', {
      courseId: String(course._id),
      lessonId: String(lessonInOtherCourse), // wrong course
    }));
    expect(res.status).toBe(404);
  });

  it('non-enrolled user cannot mark progress (403)', async () => {
    setCurrentUser({ id: String(otherStudent._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await enrollmentsApi();
    const res = await POST(jsonReq('/api/enrollments', 'POST', {
      courseId: String(course._id),
      lessonId: String(lessonId),
    }));
    expect(res.status).toBe(403);
  });

  it('progress request from wrong academic year → 403', async () => {
    const wrongYearStudent = await makeUser({ role: 'student', academicYear: 'grade2_secondary' });
    await makeEnrollment({ user: wrongYearStudent._id, course: course._id, status: 'active' });
    setCurrentUser({ id: String(wrongYearStudent._id), role: 'student', academicYear: 'grade2_secondary' });
    const { POST } = await enrollmentsApi();
    const res = await POST(jsonReq('/api/enrollments', 'POST', {
      courseId: String(course._id),
      lessonId: String(lessonId),
    }));
    expect(res.status).toBe(403);
  });

  it('happy path — completes a lesson, computes percentage, lastLesson set', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await enrollmentsApi();
    const res = await POST(jsonReq('/api/enrollments', 'POST', {
      courseId: String(course._id), lessonId: String(lessonId),
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.progress.percentage).toBe(50); // 1 of 2 lessons
    const fresh = await Enrollment.findOne({ user: student._id, course: course._id });
    expect(String(fresh?.progress.lastLesson)).toBe(String(lessonId));
    expect(fresh?.progress.completedLessons).toHaveLength(1);
  });

  it('idempotent — completing the same lesson twice does not duplicate', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await enrollmentsApi();
    await POST(jsonReq('/api/enrollments', 'POST', {
      courseId: String(course._id), lessonId: String(lessonId),
    }));
    await POST(jsonReq('/api/enrollments', 'POST', {
      courseId: String(course._id), lessonId: String(lessonId),
    }));
    const fresh = await Enrollment.findOne({ user: student._id, course: course._id });
    expect(fresh?.progress.completedLessons).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/users/me — read profile', () => {
  it('rejects unauthenticated', async () => {
    setCurrentUser(null);
    const { GET } = await meApi();
    const res = await GET(mockRequest('/api/users/me') as any);
    expect(res.status).toBe(401);
  });

  it('returns own profile WITHOUT password field', async () => {
    const u = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(u._id), role: 'student' });
    const { GET } = await meApi();
    const res = await GET(mockRequest('/api/users/me') as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.email).toBe(u.email);
    const blob = JSON.stringify(json);
    expect(blob).not.toContain('password');
    expect(blob).not.toContain('resetPasswordToken');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/users/me — profile & password update', () => {
  let user: any;

  beforeEach(async () => {
    user = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(user._id), role: 'student' });
  });

  it('updates name', async () => {
    const { PUT } = await meApi();
    const res = await PUT(jsonReq('/api/users/me', 'PUT', { name: 'New Name' }));
    expect(res.status).toBe(200);
    const fresh = await User.findById(user._id);
    expect(fresh?.name).toBe('New Name');
  });

  it('rejects 1-char name', async () => {
    const { PUT } = await meApi();
    const res = await PUT(jsonReq('/api/users/me', 'PUT', { name: 'X' }));
    expect(res.status).toBe(400);
  });

  it('rejects malformed phone', async () => {
    const { PUT } = await meApi();
    const res = await PUT(jsonReq('/api/users/me', 'PUT', { phone: '<script>' }));
    expect(res.status).toBe(400);
  });

  it('CRITICAL: rejects javascript: avatar URL (XSS)', async () => {
    const { PUT } = await meApi();
    const res = await PUT(jsonReq('/api/users/me', 'PUT', { avatar: 'javascript:alert(1)' }));
    expect(res.status).toBe(400);
  });

  it('CRITICAL: rejects data: avatar URL', async () => {
    const { PUT } = await meApi();
    const res = await PUT(jsonReq('/api/users/me', 'PUT', { avatar: 'data:text/html,<script>x</script>' }));
    expect(res.status).toBe(400);
  });

  it('accepts https avatar URL', async () => {
    const { PUT } = await meApi();
    const res = await PUT(jsonReq('/api/users/me', 'PUT', { avatar: 'https://cdn.example.com/x.png' }));
    expect(res.status).toBe(200);
  });

  it('rejects empty body (no fields to update)', async () => {
    const { PUT } = await meApi();
    const res = await PUT(jsonReq('/api/users/me', 'PUT', {}));
    expect(res.status).toBe(400);
  });

  it('password change requires correct current password', async () => {
    const { PUT } = await meApi();
    const res = await PUT(jsonReq('/api/users/me', 'PUT', {
      currentPassword: 'WrongPass1',
      newPassword: 'BrandNew1',
    }));
    expect(res.status).toBe(400);
  });

  it('password change rejects same-as-current', async () => {
    const { PUT } = await meApi();
    const res = await PUT(jsonReq('/api/users/me', 'PUT', {
      currentPassword: 'Password1',
      newPassword: 'Password1',
    }));
    expect(res.status).toBe(400);
  });

  it('password change rejects weak (no digit)', async () => {
    const { PUT } = await meApi();
    const res = await PUT(jsonReq('/api/users/me', 'PUT', {
      currentPassword: 'Password1',
      newPassword: 'Brandnewpass',
    }));
    expect(res.status).toBe(400);
  });

  it('password change happy path — new password works', async () => {
    const { PUT } = await meApi();
    const res = await PUT(jsonReq('/api/users/me', 'PUT', {
      currentPassword: 'Password1',
      newPassword: 'BrandNew1',
    }));
    expect(res.status).toBe(200);
    const fresh = await User.findById(user._id).select('+password');
    const ok = await fresh!.comparePassword('BrandNew1');
    expect(ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/users/me — registration rollback rules', () => {
  let inst: any, course: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    course = await makeCourse({ instructor: inst._id, isPublished: true });
  });

  it('rejects unauthenticated', async () => {
    setCurrentUser(null);
    const { DELETE } = await meApi();
    const res = await DELETE(jsonReq('/api/users/me', 'DELETE'));
    expect(res.status).toBe(401);
  });

  it('allows delete of fresh account with no enrollments / payments', async () => {
    const u = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(u._id), role: 'student' });
    const { DELETE } = await meApi();
    const res = await DELETE(jsonReq('/api/users/me', 'DELETE'));
    expect(res.status).toBe(200);
    expect(await User.findById(u._id)).toBeNull();
  });

  it('rejects delete when account is older than 5 minutes', async () => {
    const u = await makeUser({ role: 'student' });
    // Bypass mongoose timestamp middleware via native driver to backdate createdAt
    await User.collection.updateOne(
      { _id: u._id },
      { $set: { createdAt: new Date(Date.now() - 10 * 60_000) } },
    );
    setCurrentUser({ id: String(u._id), role: 'student' });
    const { DELETE } = await meApi();
    const res = await DELETE(jsonReq('/api/users/me', 'DELETE'));
    expect(res.status).toBe(403);
    expect(await User.findById(u._id)).toBeTruthy();
  });

  it('rejects delete when payments exist', async () => {
    const u = await makeUser({ role: 'student' });
    await makePayment({ user: u._id, course: course._id, amount: 100, status: 'paid' });
    setCurrentUser({ id: String(u._id), role: 'student' });
    const { DELETE } = await meApi();
    const res = await DELETE(jsonReq('/api/users/me', 'DELETE'));
    expect(res.status).toBe(403);
  });

  // REGRESSION (Bug-fix A): The previous implementation queried the non-existent
  // Enrollment.student field, so the count was always 0 and a user with active
  // enrollments could still self-delete in the rollback window.
  it('REGRESSION: rejects self-delete when an Enrollment exists (counts user, not student)', async () => {
    const u = await makeUser({ role: 'student' });
    await makeEnrollment({ user: u._id, course: course._id, status: 'active' });
    setCurrentUser({ id: String(u._id), role: 'student' });
    const { DELETE } = await meApi();
    const res = await DELETE(jsonReq('/api/users/me', 'DELETE'));
    expect(res.status).toBe(403);
    expect(await User.findById(u._id)).toBeTruthy();
  });
});
