/**
 * Integration tests for GET /api/enrollments and POST /api/enrollments/progress
 *
 * Covers:
 *  GET /api/enrollments:
 *    - Unauthenticated → 401
 *    - Returns only active enrollments for the authenticated user
 *    - Does not return pending/expired enrollments
 *    - Does not return other users' enrollments
 *    - Populated course includes instructor name
 *
 *  POST /api/enrollments/progress:
 *    - Unauthenticated → 401
 *    - Missing courseId or lessonId → 400
 *    - Invalid ObjectId format → 400
 *    - Course not found → 404
 *    - Lesson ID not in course → 404
 *    - Academic year mismatch → 403
 *    - Not enrolled → 403
 *    - First completion: adds lesson, calculates percentage
 *    - Idempotent: completing same lesson twice doesn't duplicate
 *    - Completing all lessons → 100%
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { makeUser, makeCourse, makeEnrollment } from './factories';
import { setCurrentUser, clearCurrentUser, mockRequest } from './auth-mock';
import { Course, Enrollment } from '@/models';

async function enrollmentsApi() {
  return import('@/app/api/enrollments/route');
}

// ─── GET /api/enrollments ─────────────────────────────────────────────────────

describe('GET /api/enrollments — auth', () => {
  it('returns 401 for unauthenticated requests', async () => {
    clearCurrentUser();
    const { GET } = await enrollmentsApi();
    const res = await GET(mockRequest('/api/enrollments'));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/enrollments — listing', () => {
  let inst: any;
  let student: any;
  let other: any;
  let courseA: any;
  let courseB: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student' });
    other = await makeUser({ role: 'student' });
    courseA = await makeCourse({ instructor: inst._id, price: 0, isPublished: true });
    courseB = await makeCourse({ instructor: inst._id, price: 0, isPublished: true });
  });

  it('returns active enrollments for the authenticated student', async () => {
    await makeEnrollment({ user: student._id, course: courseA._id, status: 'active' });
    await makeEnrollment({ user: student._id, course: courseB._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student' });

    const { GET } = await enrollmentsApi();
    const res = await GET(mockRequest('/api/enrollments'));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.enrollments).toHaveLength(2);
  });

  it('does not return pending enrollments', async () => {
    await makeEnrollment({ user: student._id, course: courseA._id, status: 'pending' });
    setCurrentUser({ id: String(student._id), role: 'student' });

    const { GET } = await enrollmentsApi();
    const res = await GET(mockRequest('/api/enrollments'));
    const json = await res.json();

    expect(json.data.enrollments).toHaveLength(0);
  });

  it('does not return other students\' enrollments', async () => {
    await makeEnrollment({ user: other._id, course: courseA._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student' });

    const { GET } = await enrollmentsApi();
    const res = await GET(mockRequest('/api/enrollments'));
    const json = await res.json();

    expect(json.data.enrollments).toHaveLength(0);
  });

  it('populated course includes title, slug, instructor name — not password', async () => {
    await makeEnrollment({ user: student._id, course: courseA._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student' });

    const { GET } = await enrollmentsApi();
    const res = await GET(mockRequest('/api/enrollments'));
    const json = await res.json();
    const enrollment = json.data.enrollments[0];

    expect(enrollment.course.title).toBeDefined();
    expect(enrollment.course.slug).toBeDefined();
    expect(enrollment.course.instructor).toBeDefined();
    expect(enrollment.course.instructor.password).toBeUndefined();
  });

  it('returns empty array when student has no enrollments', async () => {
    setCurrentUser({ id: String(student._id), role: 'student' });

    const { GET } = await enrollmentsApi();
    const res = await GET(mockRequest('/api/enrollments'));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.enrollments).toHaveLength(0);
  });
});

// ─── POST /api/enrollments/progress ──────────────────────────────────────────

describe('POST /api/enrollments/progress — auth & validation', () => {
  it('returns 401 for unauthenticated requests', async () => {
    clearCurrentUser();
    const { POST } = await enrollmentsApi();
    const res = await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: '507f1f77bcf86cd799439011', lessonId: '507f1f77bcf86cd799439012' },
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when courseId is missing', async () => {
    const student = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(student._id), role: 'student' });

    const { POST } = await enrollmentsApi();
    const res = await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { lessonId: '507f1f77bcf86cd799439012' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when lessonId is missing', async () => {
    const student = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(student._id), role: 'student' });

    const { POST } = await enrollmentsApi();
    const res = await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: '507f1f77bcf86cd799439011' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid ObjectId formats', async () => {
    const student = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(student._id), role: 'student' });

    const { POST } = await enrollmentsApi();
    const res = await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: 'not-valid', lessonId: 'also-not-valid' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when course does not exist', async () => {
    const student = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(student._id), role: 'student' });

    const { POST } = await enrollmentsApi();
    const res = await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: '507f1f77bcf86cd799439011', lessonId: '507f1f77bcf86cd799439012' },
    }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/enrollments/progress — progress tracking', () => {
  let inst: any;
  let student: any;
  let course: any;
  let lesson1Id: mongoose.Types.ObjectId;
  let lesson2Id: mongoose.Types.ObjectId;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student' });

    lesson1Id = new mongoose.Types.ObjectId();
    lesson2Id = new mongoose.Types.ObjectId();

    course = await Course.create({
      title: 'Progress Test Course',
      slug: `progress-course-${Date.now()}`,
      description: 'Long enough description for validation purposes here.',
      instructor: inst._id,
      price: 0,
      category: 'general',
      level: 'beginner',
      language: 'ar',
      isPublished: true,
      modules: [{
        title: 'Module 1',
        order: 1,
        lessons: [
          { _id: lesson1Id, title: 'Lesson 1', type: 'pdf', isPreview: false, order: 1 },
          { _id: lesson2Id, title: 'Lesson 2', type: 'pdf', isPreview: false, order: 2 },
        ],
      }],
    });

    setCurrentUser({ id: String(student._id), role: 'student' });
  });

  it('returns 403 when student is not enrolled', async () => {
    const { POST } = await enrollmentsApi();
    const res = await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: String(course._id), lessonId: String(lesson1Id) },
    }));
    expect(res.status).toBe(403);
  });

  it('returns 404 when lessonId does not belong to the course', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    const foreignLesson = new mongoose.Types.ObjectId().toString();

    const { POST } = await enrollmentsApi();
    const res = await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: String(course._id), lessonId: foreignLesson },
    }));
    expect(res.status).toBe(404);
  });

  it('marks a lesson complete and calculates percentage (1/2 = 50%)', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });

    const { POST } = await enrollmentsApi();
    const res = await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: String(course._id), lessonId: String(lesson1Id) },
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.progress.completedLessons).toHaveLength(1);
    expect(json.data.progress.percentage).toBe(50);
  });

  it('completing both lessons gives 100%', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });

    const { POST } = await enrollmentsApi();
    await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: String(course._id), lessonId: String(lesson1Id) },
    }));
    const res = await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: String(course._id), lessonId: String(lesson2Id) },
    }));
    const json = await res.json();

    expect(json.data.progress.percentage).toBe(100);
    expect(json.data.progress.completedLessons).toHaveLength(2);
  });

  it('completing the same lesson twice does not duplicate it in completedLessons', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });

    const { POST } = await enrollmentsApi();
    await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: String(course._id), lessonId: String(lesson1Id) },
    }));
    const res = await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: String(course._id), lessonId: String(lesson1Id) },
    }));
    const json = await res.json();

    expect(json.data.progress.completedLessons).toHaveLength(1);
    expect(json.data.progress.percentage).toBe(50);
  });

  it('updates lastLesson to the most recently completed lesson', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });

    const { POST } = await enrollmentsApi();
    await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: String(course._id), lessonId: String(lesson1Id) },
    }));

    const enrollment = await Enrollment.findOne({ user: student._id, course: course._id });
    expect(enrollment?.progress.lastLesson?.toString()).toBe(String(lesson1Id));
  });

  it('returns 403 for academic year mismatch', async () => {
    // Course for grade1_secondary, student is grade4_primary
    const targetCourse = await Course.create({
      title: 'Year-gated Course',
      slug: `year-gated-${Date.now()}`,
      description: 'Long enough description for validation purposes here.',
      instructor: inst._id,
      price: 0,
      category: 'general',
      level: 'beginner',
      language: 'ar',
      isPublished: true,
      targetYear: 'grade1_secondary',
      modules: [{
        title: 'Module 1', order: 1,
        lessons: [{ _id: lesson1Id, title: 'L1', type: 'pdf', isPreview: false, order: 1 }],
      }],
    });
    const wrongYearStudent = await makeUser({ role: 'student', academicYear: 'grade4_primary' });
    setCurrentUser({ id: String(wrongYearStudent._id), role: 'student', academicYear: 'grade4_primary' });
    await makeEnrollment({ user: wrongYearStudent._id, course: targetCourse._id, status: 'active' });

    const { POST } = await enrollmentsApi();
    const res = await POST(mockRequest('/api/enrollments', {
      method: 'POST',
      body: { courseId: String(targetCourse._id), lessonId: String(lesson1Id) },
    }));
    expect(res.status).toBe(403);
  });
});
