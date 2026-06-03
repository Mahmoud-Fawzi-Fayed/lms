/**
 * Integration tests — payment initiation routes.
 *
 *   POST /api/payments/initiate           (course)
 *   POST /api/payments/exams/initiate     (standalone exam)
 *
 * Pentest/QA focus:
 *  - Authentication required
 *  - Body schema (invalid courseId, invalid method, missing fields)
 *  - 404 for unpublished / non-existent course
 *  - 403 academic-year mismatch
 *  - 400 already-enrolled (idempotent guard)
 *  - free course → instant active enrollment, payment.status=paid, increments enrollmentCount
 *  - paid course → creates pending Payment, returns iframeUrl, persists paymobOrderId+token
 *  - resumable pending payment when same method
 *  - new method invalidates pending and creates fresh payment
 *  - exam-linked exam blocks /api/payments/exams/initiate (must use /payments/initiate for course)
 *  - free standalone exam → ExamEnrollment active, no Paymob call
 *  - paid standalone exam → ExamEnrollment pending + Paymob call
 *  - already-active ExamEnrollment → 400
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { makeUser, makeCourse, makeEnrollment, makeExam, makePayment } from './factories';
import { setCurrentUser, clearCurrentUser } from './auth-mock';
import { Course, Enrollment, Payment, ExamEnrollment, Exam } from '@/models';

// ─── Mock Paymob to avoid real HTTP calls ─────────────────────────────────────
vi.mock('@/lib/paymob', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/paymob')>();
  return {
    ...actual,
    initiatePayment: vi.fn(async () => ({
      paymentKey: 'pk-test',
      paymobOrderId: 555_111,
      iframeUrl: 'https://accept.paymob.com/api/acceptance/iframes/x?payment_token=pk-test',
    })),
  };
});

const { initiatePayment } = await import('@/lib/paymob');
const mockInit = vi.mocked(initiatePayment);

beforeEach(() => {
  process.env.PAYMOB_IFRAME_ID = 'iframe-id-test';
  mockInit.mockClear();
  mockInit.mockResolvedValue({
    paymentKey: 'pk-test',
    paymobOrderId: 555_111,
    iframeUrl: 'https://accept.paymob.com/api/acceptance/iframes/x?payment_token=pk-test',
  } as any);
});

async function courseInitApi() {
  return import('@/app/api/payments/initiate/route');
}
async function examInitApi() {
  return import('@/app/api/payments/exams/initiate/route');
}

function jsonReq(url: string, body: any) {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/initiate (course)', () => {
  let inst: any, student: any;
  let freeCourse: any, paidCourse: any, draftCourse: any, sec2Course: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    freeCourse = await makeCourse({ instructor: inst._id, price: 0, isPublished: true, targetYear: 'grade1_secondary' });
    paidCourse = await makeCourse({ instructor: inst._id, price: 200, isPublished: true, targetYear: 'grade1_secondary' });
    draftCourse = await makeCourse({ instructor: inst._id, price: 100, isPublished: false, targetYear: 'grade1_secondary' });
    sec2Course = await makeCourse({ instructor: inst._id, price: 300, isPublished: true, targetYear: 'grade2_secondary' });
  });

  it('rejects unauthenticated request', async () => {
    clearCurrentUser();
    const { POST } = await courseInitApi();
    const res = await POST(jsonReq('/api/payments/initiate', {
      courseId: String(paidCourse._id), method: 'card',
    }));
    expect(res.status).toBe(401);
  });

  it('rejects invalid courseId (not an ObjectId)', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await courseInitApi();
    const res = await POST(jsonReq('/api/payments/initiate', { courseId: 'bad', method: 'card' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid method', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await courseInitApi();
    const res = await POST(jsonReq('/api/payments/initiate', {
      courseId: String(paidCourse._id), method: 'bitcoin',
    }));
    expect(res.status).toBe(400);
  });

  it('rejects garbage JSON', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await courseInitApi();
    const req = new NextRequest(new URL('http://localhost/api/payments/initiate'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 for unpublished course', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await courseInitApi();
    const res = await POST(jsonReq('/api/payments/initiate', {
      courseId: String(draftCourse._id), method: 'card',
    }));
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent course', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await courseInitApi();
    const res = await POST(jsonReq('/api/payments/initiate', {
      courseId: new mongoose.Types.ObjectId().toString(), method: 'card',
    }));
    expect(res.status).toBe(404);
  });

  it('rejects 403 when student academic year != course targetYear', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await courseInitApi();
    const res = await POST(jsonReq('/api/payments/initiate', {
      courseId: String(sec2Course._id), method: 'card',
    }));
    expect(res.status).toBe(403);
  });

  it('rejects 400 if already actively enrolled', async () => {
    await makeEnrollment({ user: student._id, course: paidCourse._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await courseInitApi();
    const res = await POST(jsonReq('/api/payments/initiate', {
      courseId: String(paidCourse._id), method: 'card',
    }));
    expect(res.status).toBe(400);
  });

  it('FREE course auto-enrolls and increments enrollmentCount; no Paymob call', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const before = (await Course.findById(freeCourse._id))!.enrollmentCount;
    const { POST } = await courseInitApi();
    const res = await POST(jsonReq('/api/payments/initiate', {
      courseId: String(freeCourse._id), method: 'card',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.enrolled).toBe(true);
    expect(mockInit).not.toHaveBeenCalled();
    const enrollment = await Enrollment.findOne({ user: student._id, course: freeCourse._id });
    expect(enrollment?.status).toBe('active');
    const payment = await Payment.findOne({ user: student._id, course: freeCourse._id });
    expect(payment?.status).toBe('paid');
    expect(payment?.method).toBe('free');
    const after = (await Course.findById(freeCourse._id))!.enrollmentCount;
    expect(after).toBe(before + 1);
  });

  it('PAID course creates pending Payment and returns iframeUrl', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await courseInitApi();
    const res = await POST(jsonReq('/api/payments/initiate', {
      courseId: String(paidCourse._id), method: 'card',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.iframeUrl).toContain('paymob.com');
    expect(mockInit).toHaveBeenCalledOnce();
    const payment = await Payment.findOne({ user: student._id, course: paidCourse._id, status: 'pending' });
    expect(payment).toBeTruthy();
    expect(payment?.amount).toBe(200);
    expect(payment?.paymobOrderId).toBe('555111');
    expect(payment?.paymobToken).toBe('pk-test');
    // Must NOT auto-create enrollment for a paid course (only the webhook does).
    const enrollment = await Enrollment.findOne({ user: student._id, course: paidCourse._id });
    expect(enrollment).toBeNull();
  });

  it('uses discountPrice when set and lower than price', async () => {
    const discounted = await makeCourse({
      instructor: inst._id, price: 500, isPublished: true, targetYear: 'grade1_secondary',
    });
    await Course.findByIdAndUpdate(discounted._id, { discountPrice: 199 });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await courseInitApi();
    const res = await POST(jsonReq('/api/payments/initiate', {
      courseId: String(discounted._id), method: 'card',
    }));
    expect(res.status).toBe(200);
    const payment = await Payment.findOne({ user: student._id, course: discounted._id });
    expect(payment?.amount).toBe(199);
  });

  it('resumes pending payment when same method is requested', async () => {
    // Pre-create a recent pending payment with a token
    const existing = await Payment.create({
      user: student._id, course: paidCourse._id, amount: 200, method: 'card',
      status: 'pending', paymobToken: 'old-token', paymobOrderId: '111',
    });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await courseInitApi();
    const res = await POST(jsonReq('/api/payments/initiate', {
      courseId: String(paidCourse._id), method: 'card',
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.pending).toBe(true);
    expect(json.data.paymentKey).toBe('old-token');
    expect(mockInit).not.toHaveBeenCalled();
    // No new pending payment was created
    const count = await Payment.countDocuments({ user: student._id, course: paidCourse._id, status: 'pending' });
    expect(count).toBe(1);
  });

  it('switching method invalidates old pending and creates a new one', async () => {
    await Payment.create({
      user: student._id, course: paidCourse._id, amount: 200, method: 'card',
      status: 'pending', paymobToken: 'old-token', paymobOrderId: '111',
    });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await courseInitApi();
    const res = await POST(jsonReq('/api/payments/initiate', {
      courseId: String(paidCourse._id), method: 'fawry',
    }));
    expect(res.status).toBe(200);
    expect(mockInit).toHaveBeenCalledOnce();
    const failed = await Payment.findOne({
      user: student._id, course: paidCourse._id, method: 'card', status: 'failed',
    });
    expect(failed).toBeTruthy();
    const newPending = await Payment.findOne({
      user: student._id, course: paidCourse._id, method: 'fawry', status: 'pending',
    });
    expect(newPending).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/exams/initiate (standalone exam)', () => {
  let inst: any, student: any;
  let freeExam: any, paidExam: any, examLinkedToCourse: any, draftExam: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    freeExam = await Exam.create({
      title: 'free', createdBy: inst._id, targetYear: 'grade1_secondary',
      accessType: 'free', price: 0, duration: 30, passingScore: 60, maxAttempts: 3, isPublished: true,
      questions: [{ type: 'mcq', text: 'q', options: [{text:'a',isCorrect:true},{text:'b',isCorrect:false}], points: 1, order: 0 }],
    });
    paidExam = await Exam.create({
      title: 'paid', createdBy: inst._id, targetYear: 'grade1_secondary',
      accessType: 'paid', price: 99, duration: 30, passingScore: 60, maxAttempts: 3, isPublished: true,
      questions: [{ type: 'mcq', text: 'q', options: [{text:'a',isCorrect:true},{text:'b',isCorrect:false}], points: 1, order: 0 }],
    });
    const course = await makeCourse({ instructor: inst._id, isPublished: true, targetYear: 'grade1_secondary' });
    examLinkedToCourse = await Exam.create({
      title: 'linked', createdBy: inst._id, course: course._id, targetYear: 'grade1_secondary',
      accessType: 'paid', price: 99, duration: 30, passingScore: 60, maxAttempts: 3, isPublished: true,
      questions: [{ type: 'mcq', text: 'q', options: [{text:'a',isCorrect:true},{text:'b',isCorrect:false}], points: 1, order: 0 }],
    });
    draftExam = await Exam.create({
      title: 'draft', createdBy: inst._id, targetYear: 'grade1_secondary',
      accessType: 'paid', price: 50, duration: 30, passingScore: 60, maxAttempts: 3, isPublished: false,
      questions: [{ type: 'mcq', text: 'q', options: [{text:'a',isCorrect:true},{text:'b',isCorrect:false}], points: 1, order: 0 }],
    });
  });

  it('rejects unauthenticated', async () => {
    clearCurrentUser();
    const { POST } = await examInitApi();
    const res = await POST(jsonReq('/api/payments/exams/initiate', {
      examId: String(paidExam._id), method: 'card',
    }));
    expect(res.status).toBe(401);
  });

  it('rejects invalid examId', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await examInitApi();
    const res = await POST(jsonReq('/api/payments/exams/initiate', { examId: 'bad', method: 'card' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when exam not published', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await examInitApi();
    const res = await POST(jsonReq('/api/payments/exams/initiate', {
      examId: String(draftExam._id), method: 'card',
    }));
    expect(res.status).toBe(404);
  });

  it('rejects 400 when exam is course-linked (must go through course payment flow)', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await examInitApi();
    const res = await POST(jsonReq('/api/payments/exams/initiate', {
      examId: String(examLinkedToCourse._id), method: 'card',
    }));
    expect(res.status).toBe(400);
  });

  it('rejects 403 on academic year mismatch', async () => {
    const otherYearStudent = await makeUser({ role: 'student', academicYear: 'grade2_secondary' });
    setCurrentUser({ id: String(otherYearStudent._id), role: 'student', academicYear: 'grade2_secondary' });
    const { POST } = await examInitApi();
    const res = await POST(jsonReq('/api/payments/exams/initiate', {
      examId: String(paidExam._id), method: 'card',
    }));
    expect(res.status).toBe(403);
  });

  it('FREE standalone exam → instant ExamEnrollment active, no Paymob call', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await examInitApi();
    const res = await POST(jsonReq('/api/payments/exams/initiate', {
      examId: String(freeExam._id), method: 'card',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.enrolled).toBe(true);
    expect(mockInit).not.toHaveBeenCalled();
    const enrollment = await ExamEnrollment.findOne({ user: student._id, exam: freeExam._id });
    expect(enrollment?.status).toBe('active');
    const payment = await Payment.findOne({ user: student._id, exam: freeExam._id });
    expect(payment?.method).toBe('free');
    expect(payment?.status).toBe('paid');
  });

  it('PAID standalone exam → ExamEnrollment pending + iframe', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await examInitApi();
    const res = await POST(jsonReq('/api/payments/exams/initiate', {
      examId: String(paidExam._id), method: 'card',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.iframeUrl).toContain('paymob.com');
    expect(mockInit).toHaveBeenCalledOnce();
    const payment = await Payment.findOne({ user: student._id, exam: paidExam._id, status: 'pending' });
    expect(payment).toBeTruthy();
    expect(payment?.amount).toBe(99);
    expect(payment?.metadata?.type).toBe('standalone_exam');
    const enrollment = await ExamEnrollment.findOne({ user: student._id, exam: paidExam._id });
    expect(enrollment?.status).toBe('pending');
  });

  it('rejects 400 when ExamEnrollment is already active', async () => {
    await ExamEnrollment.create({ user: student._id, exam: paidExam._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await examInitApi();
    const res = await POST(jsonReq('/api/payments/exams/initiate', {
      examId: String(paidExam._id), method: 'card',
    }));
    expect(res.status).toBe(400);
  });

  it('resumes recent pending payment when same method', async () => {
    const existing = await Payment.create({
      user: student._id, exam: paidExam._id, amount: 99, method: 'card',
      status: 'pending', paymobToken: 'tok-old', paymobOrderId: '999',
    });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await examInitApi();
    const res = await POST(jsonReq('/api/payments/exams/initiate', {
      examId: String(paidExam._id), method: 'card',
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.pending).toBe(true);
    expect(json.data.paymentKey).toBe('tok-old');
    expect(mockInit).not.toHaveBeenCalled();
  });
});
