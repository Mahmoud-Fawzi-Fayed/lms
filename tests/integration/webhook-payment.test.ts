/**
 * Integration tests for POST /api/webhooks/paymob
 *
 * Covers:
 *  - Successful course payment  → Enrollment active, User.subscriptionStatus=active, payment=paid
 *  - Successful exam payment    → ExamEnrollment active, User.subscriptionStatus=active
 *  - Failed payment             → no enrollment, payment=failed
 *  - Pending payment            → payment=pending, no enrollment
 *  - Invalid HMAC               → 401
 *  - Idempotent duplicate       → 200, no duplicate enrollment
 *  - Amount mismatch            → 400, payment=failed
 *  - Currency mismatch          → 400, payment=failed
 *  - Unknown paymobOrderId      → 404
 *  - Re-enrollment on existing active enrollment — enrollmentCount NOT double-incremented
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { makeUser, makeCourse, makePayment, makeExam } from './factories';
import { Enrollment, ExamEnrollment, Payment, Course, User } from '@/models';

// ─── Mock verifyWebhookHmac ───────────────────────────────────────────────────
// We test business logic here; HMAC cryptography has its own unit tests.
vi.mock('@/lib/paymob', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/paymob')>();
  return {
    ...actual,
    verifyWebhookHmac: vi.fn(() => true),
  };
});

// ─── helpers ─────────────────────────────────────────────────────────────────

const { verifyWebhookHmac } = await import('@/lib/paymob');
const mockHmac = vi.mocked(verifyWebhookHmac);

async function webhookApi() {
  return import('@/app/api/webhooks/paymob/route');
}

function webhookReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('http://localhost/api/webhooks/paymob'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Build a minimal valid Paymob webhook body */
function buildWebhookBody(opts: {
  paymobOrderId: string;
  merchantOrderId: string;
  amountCents: number;
  transactionId?: string;
  success?: boolean;
  pending?: boolean;
  errorOccured?: boolean;
  currency?: string;
  sourceType?: string;
}): Record<string, unknown> {
  return {
    obj: {
      id: opts.transactionId ?? `txn-${Date.now()}`,
      success: opts.success ?? true,
      pending: opts.pending ?? false,
      error_occured: opts.errorOccured ?? false,
      amount_cents: opts.amountCents,
      currency: opts.currency ?? 'EGP',
      order: {
        id: opts.paymobOrderId,
        merchant_order_id: opts.merchantOrderId,
        amount_cents: opts.amountCents,
      },
      source_data: {
        type: opts.sourceType ?? 'card',
        pan: null,
      },
    },
    hmac: 'mocked-hmac',
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('POST /api/webhooks/paymob — course payment', () => {
  let student: any;
  let course: any;
  let payment: any;

  beforeEach(async () => {
    mockHmac.mockReturnValue(true as any);
    const inst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student' });
    course = await makeCourse({ instructor: inst._id, price: 300, isPublished: true });
    payment = await Payment.create({
      user: student._id,
      course: course._id,
      amount: 300,
      currency: 'EGP',
      method: 'card',
      status: 'pending',
      paymobOrderId: `po-${Date.now()}`,
    });
  });

  it('marks payment paid, creates enrollment, sets user subscriptionStatus=active', async () => {
    const { POST } = await webhookApi();
    const res = await POST(webhookReq(buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: String(payment._id),
      amountCents: 30000,
    })));

    expect(res.status).toBe(200);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment?.status).toBe('paid');

    const enrollment = await Enrollment.findOne({ user: student._id, course: course._id });
    expect(enrollment).toBeTruthy();
    expect(enrollment?.status).toBe('active');

    const updatedStudent = await User.findById(student._id);
    expect(updatedStudent?.subscriptionStatus).toBe('active');
  });

  it('increments enrollmentCount on first activation', async () => {
    const before = (await Course.findById(course._id))!.enrollmentCount;
    const { POST } = await webhookApi();
    await POST(webhookReq(buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: String(payment._id),
      amountCents: 30000,
    })));
    const after = (await Course.findById(course._id))!.enrollmentCount;
    expect(after).toBe(before + 1);
  });

  it('does NOT double-increment enrollmentCount when re-activating an existing enrollment', async () => {
    // Pre-create an active enrollment (e.g. admin manually enrolled)
    await Enrollment.create({
      user: student._id,
      course: course._id,
      status: 'active',
      enrolledAt: new Date(),
    });
    await Course.findByIdAndUpdate(course._id, { enrollmentCount: 1 });

    const { POST } = await webhookApi();
    await POST(webhookReq(buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: String(payment._id),
      amountCents: 30000,
    })));

    const courseDoc = await Course.findById(course._id);
    expect(courseDoc?.enrollmentCount).toBe(1); // no increment
  });

  it('marks payment failed and returns 400 when amount_cents does not match', async () => {
    const { POST } = await webhookApi();
    const res = await POST(webhookReq(buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: String(payment._id),
      amountCents: 99999, // wrong amount
    })));
    expect(res.status).toBe(400);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment?.status).toBe('failed');
    const enrollment = await Enrollment.findOne({ user: student._id, course: course._id });
    expect(enrollment).toBeNull();
  });

  it('marks payment failed and returns 400 on currency mismatch', async () => {
    const { POST } = await webhookApi();
    const res = await POST(webhookReq(buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: String(payment._id),
      amountCents: 30000,
      currency: 'USD',
    })));
    expect(res.status).toBe(400);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment?.status).toBe('failed');
  });

  it('sets payment to pending when pending=true — no enrollment created', async () => {
    const { POST } = await webhookApi();
    const res = await POST(webhookReq(buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: String(payment._id),
      amountCents: 30000,
      success: true,
      pending: true,
    })));
    expect(res.status).toBe(200);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment?.status).toBe('pending');
    const enrollment = await Enrollment.findOne({ user: student._id, course: course._id });
    expect(enrollment).toBeNull();
  });

  it('sets payment to failed when success=false — no enrollment created', async () => {
    const { POST } = await webhookApi();
    const res = await POST(webhookReq(buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: String(payment._id),
      amountCents: 30000,
      success: false,
    })));
    expect(res.status).toBe(200);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment?.status).toBe('failed');
    const enrollment = await Enrollment.findOne({ user: student._id, course: course._id });
    expect(enrollment).toBeNull();
  });

  it('is idempotent — second webhook with same transactionId returns 200 with no side-effects', async () => {
    const transactionId = `txn-idem-${Date.now()}`;
    const body = buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: String(payment._id),
      amountCents: 30000,
      transactionId,
    });

    const { POST } = await webhookApi();
    // First call
    await POST(webhookReq(body));
    const countAfterFirst = await Enrollment.countDocuments({ user: student._id, course: course._id });

    // Second call (same transactionId, already marked paid)
    const res2 = await POST(webhookReq(body));
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.message).toMatch(/idempotent|مسبقاً/);

    const countAfterSecond = await Enrollment.countDocuments({ user: student._id, course: course._id });
    expect(countAfterSecond).toBe(countAfterFirst); // no duplicate enrollment
  });
});

describe('POST /api/webhooks/paymob — exam payment', () => {
  let student: any;
  let exam: any;
  let payment: any;

  beforeEach(async () => {
    mockHmac.mockReturnValue(true as any);
    const inst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student' });
    exam = await makeExam({ createdBy: inst._id, accessType: 'paid', price: 150 });
    payment = await Payment.create({
      user: student._id,
      exam: exam._id,
      amount: 150,
      currency: 'EGP',
      method: 'fawry',
      status: 'pending',
      paymobOrderId: `po-exam-${Date.now()}`,
    });
  });

  it('creates ExamEnrollment active, sets user subscriptionStatus=active', async () => {
    const { POST } = await webhookApi();
    const res = await POST(webhookReq(buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: String(payment._id),
      amountCents: 15000,
      sourceType: 'cash', // fawry
    })));
    expect(res.status).toBe(200);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment?.status).toBe('paid');

    const examEnrollment = await ExamEnrollment.findOne({ user: student._id, exam: exam._id });
    expect(examEnrollment).toBeTruthy();
    expect(examEnrollment?.status).toBe('active');

    const updatedStudent = await User.findById(student._id);
    expect(updatedStudent?.subscriptionStatus).toBe('active');
  });

  it('does not create a Course Enrollment for an exam-only payment', async () => {
    const { POST } = await webhookApi();
    await POST(webhookReq(buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: String(payment._id),
      amountCents: 15000,
    })));

    const courseEnrollment = await Enrollment.findOne({ user: student._id });
    expect(courseEnrollment).toBeNull();
  });
});

describe('POST /api/webhooks/paymob — security & edge cases', () => {
  let student: any;
  let course: any;
  let payment: any;

  beforeEach(async () => {
    mockHmac.mockReturnValue(true as any);
    const inst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student' });
    course = await makeCourse({ instructor: inst._id, price: 200, isPublished: true });
    payment = await Payment.create({
      user: student._id,
      course: course._id,
      amount: 200,
      currency: 'EGP',
      method: 'card',
      status: 'pending',
      paymobOrderId: `po-sec-${Date.now()}`,
    });
  });

  it('returns 401 when HMAC verification fails', async () => {
    mockHmac.mockReturnValue(false as any);
    const { POST } = await webhookApi();
    const res = await POST(webhookReq(buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: String(payment._id),
      amountCents: 20000,
    })));
    expect(res.status).toBe(401);
    // No side-effects
    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment?.status).toBe('pending');
  });

  it('returns 415 when content-type is not JSON', async () => {
    const { POST } = await webhookApi();
    const res = await POST(new NextRequest(new URL('http://localhost/api/webhooks/paymob'), {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'some text',
    }));
    expect(res.status).toBe(415);
  });

  it('returns 400 when transaction object is missing', async () => {
    const { POST } = await webhookApi();
    const res = await POST(webhookReq({ hmac: 'abc' })); // no obj
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown paymobOrderId', async () => {
    const { POST } = await webhookApi();
    const res = await POST(webhookReq(buildWebhookBody({
      paymobOrderId: 'po-does-not-exist',
      merchantOrderId: String(payment._id),
      amountCents: 20000,
    })));
    expect(res.status).toBe(404);
  });

  it('returns 400 when merchant_order_id does not match payment._id', async () => {
    const { POST } = await webhookApi();
    const otherId = new (await import('mongoose')).default.Types.ObjectId().toString();
    const res = await POST(webhookReq(buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: otherId,   // ← mismatch
      amountCents: 20000,
    })));
    expect(res.status).toBe(400);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment?.status).toBe('failed');
    expect(updatedPayment?.metadata?.validationError).toBe('merchant_order_mismatch');
  });

  it('already-paid payment (legacy guard) returns 200 without re-processing', async () => {
    // Mark payment as paid first
    await Payment.findByIdAndUpdate(payment._id, { status: 'paid' });
    const { POST } = await webhookApi();
    const res = await POST(webhookReq(buildWebhookBody({
      paymobOrderId: payment.paymobOrderId,
      merchantOrderId: String(payment._id),
      amountCents: 20000,
      transactionId: 'new-txn-id',  // different txn id — legacy guard triggers
    })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/مسبقاً/);
  });

  it('stores fawry reference number when source_type is cash', async () => {
    const fawryRef = 'FWR-99999';
    const { POST } = await webhookApi();
    await POST(webhookReq({
      obj: {
        id: `txn-fawry-${Date.now()}`,
        success: true,
        pending: false,
        error_occured: false,
        amount_cents: 20000,
        currency: 'EGP',
        order: {
          id: payment.paymobOrderId,
          merchant_order_id: String(payment._id),
        },
        source_data: { type: 'cash', pan: fawryRef },
      },
      hmac: 'mocked',
    }));

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment?.fawryReferenceNumber).toBe(fawryRef);
  });
});
