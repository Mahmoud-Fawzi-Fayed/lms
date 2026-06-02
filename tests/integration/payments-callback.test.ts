/**
 * Integration tests for GET /api/payments/callback
 *
 * Covers:
 *  - success=true → 302 to /courses/{slug}?payment=success
 *  - pending=true → 302 to /courses/{slug}?payment=pending
 *  - success=false, pending=false → 302 to /courses/{slug}?payment=failed
 *  - No matching course found → fallback to /dashboard/student?payment=...
 *  - No merchantOrderId → fallback to /dashboard/student
 *  - HMAC failure logs a warning but still redirects (no data mutation)
 *  - success=true AND pending=true → treated as pending (Fawry case)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { makeUser, makeCourse, makePayment } from './factories';

// ─── Mock verifyCallbackHmac to control HMAC validation in tests ──────────────
vi.mock('@/lib/paymob', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/paymob')>();
  return {
    ...actual,
    verifyCallbackHmac: vi.fn(() => true),
  };
});

const { verifyCallbackHmac: mockCallbackHmac } = await import('@/lib/paymob');

async function callbackApi() {
  return import('@/app/api/payments/callback/route');
}

function callbackReq(params: Record<string, string>): NextRequest {
  const qs = new URLSearchParams(params).toString();
  return new NextRequest(new URL(`http://localhost/api/payments/callback?${qs}`));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/payments/callback — redirects based on result', () => {
  let inst: any;
  let student: any;
  let course: any;
  let payment: any;

  beforeEach(async () => {
    process.env.NEXTAUTH_URL = 'https://lms.test';
    vi.mocked(mockCallbackHmac).mockReturnValue(true);

    inst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student' });
    course = await makeCourse({ instructor: inst._id, price: 100, isPublished: true });
    // Slug is set by makeCourse helper; extract it from the document
    payment = await makePayment({ user: student._id, course: course._id, amount: 100, status: 'pending' });
  });

  it('redirects to /courses/{slug}?payment=success on successful payment', async () => {
    const { GET } = await callbackApi();
    const res = await GET(callbackReq({
      success: 'true',
      pending: 'false',
      merchant_order_id: String(payment._id),
      hmac: 'valid-hmac',
    }));

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain(`/courses/${course.slug}`);
    expect(location).toContain('payment=success');
  });

  it('redirects to /courses/{slug}?payment=pending when payment is pending (Fawry)', async () => {
    const { GET } = await callbackApi();
    const res = await GET(callbackReq({
      success: 'true',
      pending: 'true',
      merchant_order_id: String(payment._id),
      hmac: 'valid-hmac',
    }));

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('payment=pending');
    expect(location).toContain(`/courses/${course.slug}`);
  });

  it('redirects to /courses/{slug}?payment=failed when payment failed', async () => {
    const { GET } = await callbackApi();
    const res = await GET(callbackReq({
      success: 'false',
      pending: 'false',
      merchant_order_id: String(payment._id),
      hmac: 'valid-hmac',
    }));

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('payment=failed');
    expect(location).toContain(`/courses/${course.slug}`);
  });

  it('falls back to /dashboard/student?payment=success when no course found', async () => {
    const unknownOrderId = new mongoose.Types.ObjectId().toString();
    const { GET } = await callbackApi();
    const res = await GET(callbackReq({
      success: 'true',
      pending: 'false',
      merchant_order_id: unknownOrderId,
      hmac: 'valid-hmac',
    }));

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/dashboard/student');
    expect(location).toContain('payment=success');
  });

  it('falls back to /dashboard/student when no merchant_order_id in query string', async () => {
    const { GET } = await callbackApi();
    const res = await GET(callbackReq({
      success: 'true',
      pending: 'false',
      hmac: 'valid-hmac',
    }));

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/dashboard/student');
  });

  it('still redirects even when HMAC is invalid (no data mutations so soft fail)', async () => {
    vi.mocked(mockCallbackHmac).mockReturnValue(false);
    const { GET } = await callbackApi();
    const res = await GET(callbackReq({
      success: 'true',
      pending: 'false',
      merchant_order_id: String(payment._id),
      hmac: 'bad-hmac',
    }));

    // Route must still redirect (not 500 or 403) — it's just a browser redirect
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get('location') ?? '';
    expect(location).toBeTruthy();
  });

  it('does NOT mutate the payment document (enrollment is handled by webhook)', async () => {
    const before = await makePayment({ user: student._id, course: course._id, amount: 100, status: 'pending' });
    const { GET } = await callbackApi();
    await GET(callbackReq({
      success: 'true',
      pending: 'false',
      merchant_order_id: String(before._id),
      hmac: 'valid-hmac',
    }));

    // Payment status must be unchanged
    const { Payment } = await import('@/models');
    const after = await Payment.findById(before._id);
    expect(after?.status).toBe('pending');
  });

  it('success=false with pending=false falls back to /dashboard/student?payment=failed when no course', async () => {
    const { GET } = await callbackApi();
    const res = await GET(callbackReq({
      success: 'false',
      pending: 'false',
      hmac: 'valid-hmac',
    }));
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/dashboard/student');
    expect(location).toContain('payment=failed');
  });
});
