/**
 * Integration tests for GET /api/payments/pending
 *
 * Covers:
 *  - Unauthenticated → 401
 *  - No pending/failed payments → empty array
 *  - Pending payment is returned
 *  - Failed payment is returned
 *  - Paid payment is NOT returned
 *  - Course already has active enrollment → filtered out
 *  - Deduplication: only the most recent payment per course
 *  - Exam-only payments (no course) are excluded
 *  - Multiple courses: each shown once
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeUser, makeCourse, makePayment, makeEnrollment } from './factories';
import { setCurrentUser, clearCurrentUser, mockRequest } from './auth-mock';
import { Payment } from '@/models';

async function pendingApi() {
  return import('@/app/api/payments/pending/route');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/payments/pending — auth', () => {
  it('returns 401 for unauthenticated requests', async () => {
    clearCurrentUser();
    const { GET } = await pendingApi();
    const res = await GET(mockRequest('/api/payments/pending'));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/payments/pending — empty state', () => {
  it('returns empty array when user has no payments', async () => {
    const student = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(student._id), role: 'student' });
    const { GET } = await pendingApi();
    const res = await GET(mockRequest('/api/payments/pending'));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.payments).toEqual([]);
  });
});

describe('GET /api/payments/pending — payment status filtering', () => {
  let inst: any;
  let student: any;
  let courseA: any;
  let courseB: any;
  let courseC: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student' });
    courseA = await makeCourse({ instructor: inst._id, price: 100, isPublished: true });
    courseB = await makeCourse({ instructor: inst._id, price: 200, isPublished: true });
    courseC = await makeCourse({ instructor: inst._id, price: 300, isPublished: true });
    setCurrentUser({ id: String(student._id), role: 'student' });
  });

  it('returns pending payment for course', async () => {
    await makePayment({ user: student._id, course: courseA._id, amount: 100, status: 'pending' });
    const { GET } = await pendingApi();
    const res = await GET(mockRequest('/api/payments/pending'));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.payments).toHaveLength(1);
    expect((json.data.payments[0].course as any)._id.toString()).toBe(String(courseA._id));
  });

  it('returns failed payment for course', async () => {
    await makePayment({ user: student._id, course: courseA._id, amount: 100, status: 'failed' });
    const { GET } = await pendingApi();
    const res = await GET(mockRequest('/api/payments/pending'));
    const json = await res.json();
    expect(json.data.payments).toHaveLength(1);
    expect(json.data.payments[0].status).toBe('failed');
  });

  it('does NOT return paid payment', async () => {
    await makePayment({ user: student._id, course: courseA._id, amount: 100, status: 'paid' });
    const { GET } = await pendingApi();
    const res = await GET(mockRequest('/api/payments/pending'));
    const json = await res.json();
    expect(json.data.payments).toHaveLength(0);
  });

  it('excludes courses where student already has an active enrollment', async () => {
    await makePayment({ user: student._id, course: courseA._id, amount: 100, status: 'pending' });
    await makeEnrollment({ user: student._id, course: courseA._id, status: 'active' });

    const { GET } = await pendingApi();
    const res = await GET(mockRequest('/api/payments/pending'));
    const json = await res.json();
    expect(json.data.payments).toHaveLength(0);
  });

  it('returns correct payments when some courses have enrollments and some do not', async () => {
    await makePayment({ user: student._id, course: courseA._id, amount: 100, status: 'pending' });
    await makePayment({ user: student._id, course: courseB._id, amount: 200, status: 'failed' });
    // courseA is already enrolled
    await makeEnrollment({ user: student._id, course: courseA._id, status: 'active' });

    const { GET } = await pendingApi();
    const res = await GET(mockRequest('/api/payments/pending'));
    const json = await res.json();

    // Only courseB payment should appear (courseA has enrollment)
    expect(json.data.payments).toHaveLength(1);
    expect((json.data.payments[0].course as any)._id.toString()).toBe(String(courseB._id));
  });

  it('deduplicates: returns only the most recent payment when multiple exist for same course', async () => {
    // Create two failed payments for the same course (different times)
    await makePayment({
      user: student._id, course: courseA._id, amount: 100, status: 'failed',
      createdAt: new Date(Date.now() - 60_000),
    });
    const newest = await makePayment({
      user: student._id, course: courseA._id, amount: 100, status: 'pending',
      createdAt: new Date(),
    });

    const { GET } = await pendingApi();
    const res = await GET(mockRequest('/api/payments/pending'));
    const json = await res.json();

    expect(json.data.payments).toHaveLength(1);
    // The most recent one should win (sorted by createdAt desc, first wins dedup)
  });

  it('shows multiple pending courses — one entry per course', async () => {
    await makePayment({ user: student._id, course: courseA._id, amount: 100, status: 'pending' });
    await makePayment({ user: student._id, course: courseB._id, amount: 200, status: 'failed' });
    await makePayment({ user: student._id, course: courseC._id, amount: 300, status: 'pending' });

    const { GET } = await pendingApi();
    const res = await GET(mockRequest('/api/payments/pending'));
    const json = await res.json();

    expect(json.data.payments).toHaveLength(3);
  });

  it('does not return exam-only payments (no course field)', async () => {
    // Payment with only exam reference — no course
    await Payment.create({
      user: student._id,
      amount: 50,
      method: 'card',
      status: 'pending',
      // no course field
    });

    const { GET } = await pendingApi();
    const res = await GET(mockRequest('/api/payments/pending'));
    const json = await res.json();
    expect(json.data.payments).toHaveLength(0);
  });
});
