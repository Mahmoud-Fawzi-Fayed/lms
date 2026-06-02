/**
 * Integration tests for GET /api/exams and POST /api/exams
 *
 * Covers:
 *  GET /api/exams (listing):
 *    - Anonymous user sees all published exams
 *    - Student sees only exams for their academic year
 *    - Student without academic year → no exams returned
 *    - courseId filter narrows results to course exams
 *    - Unpublished exams hidden from students
 *    - Instructor sees their own unpublished exams
 *    - myAttempts=true returns student's submitted/timed-out attempts
 *    - myAttempts=true requires authentication
 *    - canAccess flag: free/course exams → true; standalone paid without enrollment → false
 *    - Correct answers not leaked in GET response
 *
 *  POST /api/exams (create):
 *    - Unauthenticated → 401
 *    - Student cannot create exam → 403
 *    - Instructor creates exam successfully
 *    - Instructor cannot create exam for another instructor's course → 403
 *    - Admin can create exam for any course
 *    - Paid exam with 0 price → rejected
 *    - MCQ without correct answer → rejected
 *    - MCQ with fewer than 2 options → rejected
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeUser, makeCourse, makeExam, makeAttempt, makeEnrollment } from './factories';
import { setCurrentUser, clearCurrentUser, mockRequest } from './auth-mock';
import { ExamEnrollment } from '@/models';

async function examsApi() {
  return import('@/app/api/exams/route');
}

// ─── GET /api/exams — listing ─────────────────────────────────────────────────

describe('GET /api/exams — anonymous & role-based visibility', () => {
  let instA: any;
  let instB: any;
  let examSec1Published: any;
  let examSec2Published: any;
  let examSec1Unpublished: any;

  beforeEach(async () => {
    instA = await makeUser({ role: 'instructor' });
    instB = await makeUser({ role: 'instructor' });

    examSec1Published = await makeExam({
      createdBy: instA._id,
      title: 'Sec1 Published',
      targetYear: 'grade1_secondary',
      isPublished: true,
    });
    examSec2Published = await makeExam({
      createdBy: instB._id,
      title: 'Sec2 Published',
      targetYear: 'grade2_secondary',
      isPublished: true,
    });
    examSec1Unpublished = await makeExam({
      createdBy: instA._id,
      title: 'Sec1 Draft',
      targetYear: 'grade1_secondary',
      isPublished: false,
    });
  });

  it('anonymous user sees all published exams', async () => {
    clearCurrentUser();
    const { GET } = await examsApi();
    const res = await GET(mockRequest('/api/exams'));
    const json = await res.json();
    expect(json.success).toBe(true);
    const titles = json.data.exams.map((e: any) => e.title).sort();
    expect(titles).toContain('Sec1 Published');
    expect(titles).toContain('Sec2 Published');
    expect(titles).not.toContain('Sec1 Draft');
  });

  it('student sees only published exams for their academic year', async () => {
    const stu = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    setCurrentUser({ id: String(stu._id), role: 'student', academicYear: 'grade1_secondary' });

    const { GET } = await examsApi();
    const res = await GET(mockRequest('/api/exams'));
    const json = await res.json();

    const titles = json.data.exams.map((e: any) => e.title);
    expect(titles).toContain('Sec1 Published');
    expect(titles).not.toContain('Sec2 Published');
    expect(titles).not.toContain('Sec1 Draft');
  });

  it('student without academicYear gets no exams', async () => {
    const stu = await makeUser({ role: 'student' }); // no academicYear
    setCurrentUser({ id: String(stu._id), role: 'student' });

    const { GET } = await examsApi();
    const res = await GET(mockRequest('/api/exams'));
    const json = await res.json();
    expect(json.data.exams).toHaveLength(0);
  });

  it('instructor sees their own unpublished exams when listing all', async () => {
    setCurrentUser({ id: String(instA._id), role: 'instructor' });

    const { GET } = await examsApi();
    const res = await GET(mockRequest('/api/exams'));
    const json = await res.json();

    const titles = json.data.exams.map((e: any) => e.title);
    expect(titles).toContain('Sec1 Draft'); // instructor's own draft
  });

  it('does not leak correct answers in GET response', async () => {
    clearCurrentUser();
    const { GET } = await examsApi();
    const res = await GET(mockRequest('/api/exams'));
    const json = await res.json();

    for (const exam of json.data.exams) {
      for (const q of exam.questions ?? []) {
        for (const opt of q.options ?? []) {
          expect(opt.isCorrect).toBeUndefined();
        }
        expect(q.correctAnswer).toBeUndefined();
        expect(q.explanation).toBeUndefined();
      }
    }
  });
});

describe('GET /api/exams — courseId filter', () => {
  it('returns only exams for the specified course', async () => {
    const inst = await makeUser({ role: 'instructor' });
    const courseA = await makeCourse({ instructor: inst._id, price: 0, isPublished: true });
    const courseB = await makeCourse({ instructor: inst._id, price: 0, isPublished: true });
    await makeExam({ createdBy: inst._id, course: courseA._id, title: 'CourseA Exam', isPublished: true });
    await makeExam({ createdBy: inst._id, course: courseB._id, title: 'CourseB Exam', isPublished: true });

    clearCurrentUser();
    const { GET } = await examsApi();
    const res = await GET(mockRequest(`/api/exams?courseId=${courseA._id}`));
    const json = await res.json();

    expect(json.data.exams).toHaveLength(1);
    expect(json.data.exams[0].title).toBe('CourseA Exam');
  });
});

describe('GET /api/exams — myAttempts', () => {
  it('returns 401 when myAttempts=true without authentication', async () => {
    clearCurrentUser();
    const { GET } = await examsApi();
    const res = await GET(mockRequest('/api/exams?myAttempts=true'));
    expect(res.status).toBe(401);
  });

  it('returns student submitted and timed-out attempts only', async () => {
    const inst = await makeUser({ role: 'instructor' });
    const stu = await makeUser({ role: 'student' });
    const exam = await makeExam({ createdBy: inst._id, isPublished: true });

    await makeAttempt({ user: stu._id, exam: exam._id, status: 'submitted', score: 80, passed: true });
    await makeAttempt({ user: stu._id, exam: exam._id, status: 'timed-out', score: 30, passed: false, attemptNumber: 2 });
    await makeAttempt({ user: stu._id, exam: exam._id, status: 'in-progress', attemptNumber: 3 }); // excluded

    setCurrentUser({ id: String(stu._id), role: 'student' });
    const { GET } = await examsApi();
    const res = await GET(mockRequest('/api/exams?myAttempts=true'));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.attempts).toHaveLength(2); // submitted + timed-out only
    expect(json.data.attempts.every((a: any) => ['submitted', 'timed-out'].includes(a.status))).toBe(true);
  });
});

describe('GET /api/exams — canAccess flag for students', () => {
  it('canAccess=true for free standalone exams', async () => {
    const inst = await makeUser({ role: 'instructor' });
    await makeExam({
      createdBy: inst._id,
      title: 'Free Standalone',
      targetYear: 'grade1_secondary',
      accessType: 'free',
      price: 0,
      isPublished: true,
    });

    const stu = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    setCurrentUser({ id: String(stu._id), role: 'student', academicYear: 'grade1_secondary' });

    const { GET } = await examsApi();
    const res = await GET(mockRequest('/api/exams'));
    const json = await res.json();

    const freeExam = json.data.exams.find((e: any) => e.title === 'Free Standalone');
    expect(freeExam).toBeTruthy();
    expect(freeExam.canAccess).toBe(true);
  });

  it('canAccess=false for paid standalone exam without enrollment', async () => {
    const inst = await makeUser({ role: 'instructor' });
    await makeExam({
      createdBy: inst._id,
      title: 'Paid Standalone',
      targetYear: 'grade1_secondary',
      accessType: 'paid',
      price: 50,
      isPublished: true,
    });

    const stu = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    setCurrentUser({ id: String(stu._id), role: 'student', academicYear: 'grade1_secondary' });

    const { GET } = await examsApi();
    const res = await GET(mockRequest('/api/exams'));
    const json = await res.json();

    const paidExam = json.data.exams.find((e: any) => e.title === 'Paid Standalone');
    expect(paidExam).toBeTruthy();
    expect(paidExam.canAccess).toBe(false);
  });

  it('canAccess=true for paid standalone exam when student is enrolled', async () => {
    const inst = await makeUser({ role: 'instructor' });
    const exam = await makeExam({
      createdBy: inst._id,
      title: 'Paid Enrolled',
      targetYear: 'grade1_secondary',
      accessType: 'paid',
      price: 50,
      isPublished: true,
    });

    const stu = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    // Create an exam enrollment
    await ExamEnrollment.create({ user: stu._id, exam: exam._id, status: 'active', enrolledAt: new Date() });
    setCurrentUser({ id: String(stu._id), role: 'student', academicYear: 'grade1_secondary' });

    const { GET } = await examsApi();
    const res = await GET(mockRequest('/api/exams'));
    const json = await res.json();

    const e = json.data.exams.find((e: any) => e.title === 'Paid Enrolled');
    expect(e?.canAccess).toBe(true);
  });
});

// ─── POST /api/exams — creation ───────────────────────────────────────────────

const VALID_EXAM_BODY = {
  title: 'Test Exam',
  targetYear: 'grade1_secondary',
  duration: 30,
  passingScore: 60,
  maxAttempts: 3,
  accessType: 'free',
  price: 0,
  isPublished: true,
  questions: [{
    type: 'mcq',
    text: 'What is 2+2?',
    order: 0,
    points: 1,
    options: [
      { text: '3', isCorrect: false },
      { text: '4', isCorrect: true },
    ],
  }],
};

describe('POST /api/exams — auth & role gating', () => {
  it('returns 401 for unauthenticated requests', async () => {
    clearCurrentUser();
    const { POST } = await examsApi();
    const res = await POST(mockRequest('/api/exams', { method: 'POST', body: VALID_EXAM_BODY }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for student role', async () => {
    const stu = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(stu._id), role: 'student' });

    const { POST } = await examsApi();
    const res = await POST(mockRequest('/api/exams', { method: 'POST', body: VALID_EXAM_BODY }));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/exams — instructor creates exam', () => {
  let inst: any;
  let otherInst: any;
  let course: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    otherInst = await makeUser({ role: 'instructor' });
    course = await makeCourse({ instructor: inst._id, price: 0, isPublished: true });
    setCurrentUser({ id: String(inst._id), role: 'instructor' });
  });

  it('instructor creates standalone free exam successfully', async () => {
    const { POST } = await examsApi();
    const res = await POST(mockRequest('/api/exams', { method: 'POST', body: VALID_EXAM_BODY }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.title).toBe('Test Exam');
  });

  it('instructor creates exam linked to their own course', async () => {
    const { POST } = await examsApi();
    const res = await POST(mockRequest('/api/exams', {
      method: 'POST',
      body: { ...VALID_EXAM_BODY, course: String(course._id) },
    }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
  });

  it('instructor cannot create exam for another instructor\'s course', async () => {
    const otherCourse = await makeCourse({ instructor: otherInst._id, price: 0, isPublished: true });
    const { POST } = await examsApi();
    const res = await POST(mockRequest('/api/exams', {
      method: 'POST',
      body: { ...VALID_EXAM_BODY, course: String(otherCourse._id) },
    }));
    expect(res.status).toBe(403);
  });

  it('admin can create exam for any course', async () => {
    const admin = await makeUser({ role: 'admin' });
    const anyCourse = await makeCourse({ instructor: inst._id, price: 0, isPublished: true });
    setCurrentUser({ id: String(admin._id), role: 'admin' });

    const { POST } = await examsApi();
    const res = await POST(mockRequest('/api/exams', {
      method: 'POST',
      body: { ...VALID_EXAM_BODY, course: String(anyCourse._id) },
    }));
    expect(res.status).toBe(201);
  });
});

describe('POST /api/exams — validation rules', () => {
  let inst: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    setCurrentUser({ id: String(inst._id), role: 'instructor' });
  });

  it('rejects paid standalone exam with price=0', async () => {
    const { POST } = await examsApi();
    const res = await POST(mockRequest('/api/exams', {
      method: 'POST',
      body: { ...VALID_EXAM_BODY, accessType: 'paid', price: 0 },
    }));
    expect(res.status).toBe(400);
  });

  it('rejects MCQ question with fewer than 2 options', async () => {
    const { POST } = await examsApi();
    const res = await POST(mockRequest('/api/exams', {
      method: 'POST',
      body: {
        ...VALID_EXAM_BODY,
        questions: [{
          type: 'mcq',
          text: 'One option question?',
          order: 0,
          points: 1,
          options: [{ text: 'Only option', isCorrect: true }],
        }],
      },
    }));
    expect(res.status).toBe(400);
  });

  it('rejects MCQ question with no correct answer marked', async () => {
    const { POST } = await examsApi();
    const res = await POST(mockRequest('/api/exams', {
      method: 'POST',
      body: {
        ...VALID_EXAM_BODY,
        questions: [{
          type: 'mcq',
          text: 'No correct option?',
          order: 0,
          points: 1,
          options: [
            { text: 'A', isCorrect: false },
            { text: 'B', isCorrect: false },
          ],
        }],
      },
    }));
    expect(res.status).toBe(400);
  });

  it('rejects request with invalid JSON body', async () => {
    const { POST } = await examsApi();
    const req = new (await import('next/server')).NextRequest(
      new URL('http://localhost/api/exams'),
      { method: 'POST', body: 'not-json', headers: { 'content-type': 'application/json' } }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
