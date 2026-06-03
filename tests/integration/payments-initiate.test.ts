/**
 * Integration tests for POST /api/payments/initiate
 *
 * Covers:
 *  - Unauthenticated request → 401
 *  - Course not found / unpublished → 404
 *  - Academic year mismatch for student → 403
 *  - Already enrolled → 400
 *  - Free course → auto-enroll, no Paymob call
 *  - Paid course → creates payment record, calls initiatePayment, returns iframeUrl
 *  - Pending payment same method → returns resume link
 *  - Pending payment different method → invalidates old, creates new
 *  - Invalid payment method → 400 (schema)
 *  - Invalid courseId format → 400 (schema)
 *  - Broken pending record (no token) → invalidates and creates fresh
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUser, makeCourse, makeEnrollment, makePayment } from './factories';
import { setCurrentUser, clearCurrentUser, mockRequest } from './auth-mock';
import { Payment, Enrollment, Course } from '@/models';

// ─── Mock Paymob external HTTP calls ─────────────────────────────────────────
vi.mock('@/lib/paymob', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/paymob')>();
  return {
    ...actual,
    initiatePayment: vi.fn(async () => ({
      paymentKey: 'mock-payment-key',
      paymobOrderId: 98765,
      iframeUrl: 'https://accept.paymob.com/api/acceptance/iframes/111?payment_token=mock-payment-key',
    })),
  };
});

const { initiatePayment: mockInitiate } = await import('@/lib/paymob');

async function initiateApi() {
  return import('@/app/api/payments/initiate/route');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/payments/initiate — auth & input validation', () => {
  it('returns 401 for unauthenticated requests', async () => {
    clearCurrentUser();
    const { POST } = await initiateApi();
    const res = await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: '507f1f77bcf86cd799439011', method: 'card' },
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid courseId format', async () => {
    const user = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(user._id), role: 'student' });
    const { POST } = await initiateApi();
    const res = await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: 'not-an-objectid', method: 'card' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown payment method', async () => {
    const user = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(user._id), role: 'student' });
    const { POST } = await initiateApi();
    const res = await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: '507f1f77bcf86cd799439011', method: 'paypal' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when course does not exist', async () => {
    const user = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(user._id), role: 'student' });
    const { POST } = await initiateApi();
    const res = await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: '507f1f77bcf86cd799439011', method: 'card' },
    }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when course exists but is unpublished', async () => {
    const inst = await makeUser({ role: 'instructor' });
    const course = await makeCourse({ instructor: inst._id, price: 100, isPublished: false });
    const user = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(user._id), role: 'student' });
    const { POST } = await initiateApi();
    const res = await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: String(course._id), method: 'card' },
    }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/payments/initiate — enrollment guards', () => {
  let inst: any;
  let student: any;
  let course: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    course = await makeCourse({ instructor: inst._id, price: 200, isPublished: true, targetYear: 'grade1_secondary' });
    student = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
  });

  it('returns 403 when student academic year does not match course targetYear', async () => {
    const wrongYearStudent = await makeUser({ role: 'student', academicYear: 'grade4_primary' });
    setCurrentUser({ id: String(wrongYearStudent._id), role: 'student', academicYear: 'grade4_primary' });
    const { POST } = await initiateApi();
    const res = await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: String(course._id), method: 'card' },
    }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when student is already actively enrolled', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    const { POST } = await initiateApi();
    const res = await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: String(course._id), method: 'card' },
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    // apiError() returns { error: string } (no `success` field). Check for the
    // error message instead of an absent `success` flag.
    expect(json.error).toBeTruthy();
  });
});

describe('POST /api/payments/initiate — free course auto-enrollment', () => {
  it('auto-enrolls student in a free course without calling Paymob', async () => {
    const inst = await makeUser({ role: 'instructor' });
    const course = await makeCourse({ instructor: inst._id, price: 0, isPublished: true });
    const student = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(student._id), role: 'student' });

    vi.mocked(mockInitiate).mockClear();

    const { POST } = await initiateApi();
    const res = await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: String(course._id), method: 'card' },
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.enrolled).toBe(true);

    // Must not call Paymob for free courses
    expect(mockInitiate).not.toHaveBeenCalled();

    // Enrollment must be created
    const enrollment = await Enrollment.findOne({ user: student._id, course: course._id });
    expect(enrollment?.status).toBe('active');

    // Payment record must be created with method=free, status=paid
    const payment = await Payment.findOne({ user: student._id, course: course._id });
    expect(payment?.method).toBe('free');
    expect(payment?.status).toBe('paid');

    // enrollmentCount incremented
    const updatedCourse = await Course.findById(course._id);
    expect(updatedCourse?.enrollmentCount).toBe(1);
  });
});

describe('POST /api/payments/initiate — paid course flow', () => {
  let inst: any;
  let student: any;
  let course: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    course = await makeCourse({ instructor: inst._id, price: 150, isPublished: true });
    student = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(student._id), role: 'student' });
    vi.mocked(mockInitiate).mockClear();
    vi.mocked(mockInitiate).mockResolvedValue({
      paymentKey: 'mock-payment-key',
      paymobOrderId: 98765,
      iframeUrl: 'https://accept.paymob.com/api/acceptance/iframes/111?payment_token=mock-payment-key',
    });
  });

  it('creates a pending payment and calls initiatePayment with correct params', async () => {
    const { POST } = await initiateApi();
    const res = await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: String(course._id), method: 'card' },
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.iframeUrl).toContain('accept.paymob.com');
    expect(mockInitiate).toHaveBeenCalledOnce();

    // Payment record must be in pending state
    const payment = await Payment.findOne({ user: student._id, course: course._id });
    expect(payment).toBeTruthy();
    expect(payment?.status).toBe('pending');
    expect(payment?.method).toBe('card');
    expect(payment?.paymobOrderId).toBe('98765');
    expect(payment?.paymobToken).toBe('mock-payment-key');
  });

  it('passes redirectUrl to initiatePayment so Paymob redirects back to LMS', async () => {
    process.env.NEXTAUTH_URL = 'https://lms.example.com';
    const { POST } = await initiateApi();
    await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: String(course._id), method: 'card' },
    }));
    const callArgs = vi.mocked(mockInitiate).mock.calls[0][0];
    expect(callArgs.redirectUrl).toBe('https://lms.example.com/api/payments/callback');
    delete process.env.NEXTAUTH_URL;
  });

  it('uses discountPrice when set on the course', async () => {
    await Course.findByIdAndUpdate(course._id, { discountPrice: 99 });
    const { POST } = await initiateApi();
    await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: String(course._id), method: 'card' },
    }));
    const callArgs = vi.mocked(mockInitiate).mock.calls[0][0];
    expect(callArgs.amountEGP).toBe(99);
  });
});

describe('POST /api/payments/initiate — pending payment handling', () => {
  let inst: any;
  let student: any;
  let course: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    course = await makeCourse({ instructor: inst._id, price: 100, isPublished: true });
    student = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(student._id), role: 'student' });
    vi.mocked(mockInitiate).mockClear();
    vi.mocked(mockInitiate).mockResolvedValue({
      paymentKey: 'new-payment-key',
      paymobOrderId: 11111,
      iframeUrl: 'https://accept.paymob.com/api/acceptance/iframes/111?payment_token=new-payment-key',
    });
  });

  it('returns resume link when a pending payment with token exists for the same method', async () => {
    // Create a recent pending payment with a token (simulating an in-progress checkout)
    const pending = await Payment.create({
      user: student._id,
      course: course._id,
      amount: 100,
      method: 'card',
      status: 'pending',
      paymobOrderId: 'po-existing',
      paymobToken: 'existing-token',
      createdAt: new Date(), // fresh, within 30-minute window
    });

    const { POST } = await initiateApi();
    const res = await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: String(course._id), method: 'card' },
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.pending).toBe(true);
    expect(json.data.paymentId).toBeTruthy();
    // Must NOT have created a new payment / called Paymob
    expect(mockInitiate).not.toHaveBeenCalled();
  });

  it('invalidates old pending payment when a different method is chosen', async () => {
    const pending = await Payment.create({
      user: student._id,
      course: course._id,
      amount: 100,
      method: 'card',
      status: 'pending',
      paymobOrderId: 'po-old',
      paymobToken: 'old-token',
      createdAt: new Date(),
    });

    const { POST } = await initiateApi();
    await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: String(course._id), method: 'fawry' },
    }));

    // Old payment must be marked failed
    const refreshed = await Payment.findById(pending._id);
    expect(refreshed?.status).toBe('failed');

    // New payment created
    const newPayment = await Payment.findOne({ user: student._id, course: course._id, method: 'fawry' });
    expect(newPayment?.status).toBe('pending');
  });

  it('invalidates broken pending record (no token) and creates fresh payment', async () => {
    // A pending record with no paymobToken — this is a broken state
    const broken = await Payment.create({
      user: student._id,
      course: course._id,
      amount: 100,
      method: 'card',
      status: 'pending',
      createdAt: new Date(),
      // No paymobToken
    });

    const { POST } = await initiateApi();
    const res = await POST(mockRequest('/api/payments/initiate', {
      method: 'POST',
      body: { courseId: String(course._id), method: 'card' },
    }));

    // Broken record must be failed
    const refreshed = await Payment.findById(broken._id);
    expect(refreshed?.status).toBe('failed');

    // New payment should be created
    expect(mockInitiate).toHaveBeenCalledOnce();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.iframeUrl).toBeTruthy();
  });
});
