/**
 * Integration tests for GET /api/admin/payments
 *
 * Covers:
 *  - Non-admin role → 403
 *  - Unauthenticated → 401
 *  - Lists all payments with populated user/course data
 *  - Filter by status (paid, pending, failed)
 *  - Filter by method (card, wallet, fawry, free)
 *  - Filter by courseId
 *  - Filter by userId
 *  - Pagination (page, limit, total)
 *  - Response enrichment: itemTitle, itemType
 *  - Password never returned in populated user
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeUser, makeCourse, makePayment, makeExam } from './factories';
import { setCurrentUser, clearCurrentUser, mockRequest } from './auth-mock';

async function adminPaymentsApi() {
  return import('@/app/api/admin/payments/route');
}

describe('GET /api/admin/payments — role gating', () => {
  it('returns 401 for unauthenticated requests', async () => {
    clearCurrentUser();
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for student role', async () => {
    const student = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(student._id), role: 'student' });
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for instructor role', async () => {
    const inst = await makeUser({ role: 'instructor' });
    setCurrentUser({ id: String(inst._id), role: 'instructor' });
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments'));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/payments — listing & filtering', () => {
  let admin: any;
  let inst: any;
  let stu1: any;
  let stu2: any;
  let courseA: any;
  let courseB: any;
  let examA: any;
  let payCard: any;
  let payWallet: any;
  let payFawry: any;
  let payFree: any;
  let payFailed: any;
  let payExam: any;

  beforeEach(async () => {
    admin = await makeUser({ role: 'admin' });
    inst = await makeUser({ role: 'instructor' });
    stu1 = await makeUser({ role: 'student', name: 'Student One', email: 'stu1@pay.io' });
    stu2 = await makeUser({ role: 'student', name: 'Student Two', email: 'stu2@pay.io' });
    courseA = await makeCourse({ instructor: inst._id, title: 'Course A', price: 100, isPublished: true });
    courseB = await makeCourse({ instructor: inst._id, title: 'Course B', price: 200, isPublished: true });
    examA = await makeExam({ createdBy: inst._id, course: courseA._id, price: 50, accessType: 'paid' });

    payCard   = await makePayment({ user: stu1._id, course: courseA._id, amount: 100, method: 'card',   status: 'paid' });
    payWallet = await makePayment({ user: stu1._id, course: courseB._id, amount: 200, method: 'wallet', status: 'paid' });
    payFawry  = await makePayment({ user: stu2._id, course: courseA._id, amount: 100, method: 'fawry',  status: 'paid' });
    payFree   = await makePayment({ user: stu2._id, course: courseB._id, amount: 0,   method: 'free',   status: 'paid' });
    payFailed = await makePayment({ user: stu1._id, course: courseA._id, amount: 100, method: 'card',   status: 'failed' });
    payExam   = await makePayment({ user: stu2._id, exam: examA._id,     amount: 50,  method: 'card',   status: 'paid' });

    setCurrentUser({ id: String(admin._id), role: 'admin' });
  });

  it('lists all 6 payments', async () => {
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments'));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.pagination.total).toBe(6);
    expect(json.data.payments).toHaveLength(6);
  });

  it('filter by status=paid returns only paid payments', async () => {
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments?status=paid'));
    const json = await res.json();
    expect(json.data.pagination.total).toBe(5);
    expect(json.data.payments.every((p: any) => p.status === 'paid')).toBe(true);
  });

  it('filter by status=failed returns only failed payments', async () => {
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments?status=failed'));
    const json = await res.json();
    expect(json.data.pagination.total).toBe(1);
    expect(json.data.payments[0].status).toBe('failed');
  });

  it('filter by method=card returns only card payments', async () => {
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments?method=card'));
    const json = await res.json();
    // card: payCard, payFailed, payExam = 3
    expect(json.data.pagination.total).toBe(3);
    expect(json.data.payments.every((p: any) => p.method === 'card')).toBe(true);
  });

  it('filter by method=fawry returns only fawry payments', async () => {
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments?method=fawry'));
    const json = await res.json();
    expect(json.data.pagination.total).toBe(1);
    expect(json.data.payments[0].method).toBe('fawry');
  });

  it('filter by method=free includes free enrollments', async () => {
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments?method=free'));
    const json = await res.json();
    expect(json.data.pagination.total).toBe(1);
    expect(json.data.payments[0].method).toBe('free');
  });

  it('filter by courseId returns payments for that course only', async () => {
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest(`/api/admin/payments?courseId=${courseA._id}`));
    const json = await res.json();
    // courseA: payCard, payFawry, payFailed = 3
    expect(json.data.pagination.total).toBe(3);
    for (const p of json.data.payments) {
      expect(p.course?._id?.toString() ?? p.course?.toString()).toBe(String(courseA._id));
    }
  });

  it('filter by userId returns payments for that user only', async () => {
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest(`/api/admin/payments?userId=${stu1._id}`));
    const json = await res.json();
    // stu1: payCard, payWallet, payFailed = 3
    expect(json.data.pagination.total).toBe(3);
    for (const p of json.data.payments) {
      expect(p.user?._id?.toString() ?? p.user?.toString()).toBe(String(stu1._id));
    }
  });

  it('pagination: page=1&limit=2 returns 2 payments with correct meta', async () => {
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments?page=1&limit=2'));
    const json = await res.json();
    expect(json.data.payments).toHaveLength(2);
    expect(json.data.pagination.total).toBe(6);
    expect(json.data.pagination.pages).toBe(3);
  });

  it('enriches course payment with itemType=course and itemTitle', async () => {
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments?status=paid&method=card'));
    const json = await res.json();
    const coursePay = json.data.payments.find((p: any) => p._id?.toString() === String(payCard._id));
    expect(coursePay).toBeTruthy();
    expect(coursePay.itemType).toBe('course');
    expect(coursePay.itemTitle).toBe('Course A');
  });

  it('enriches exam payment with itemType=exam and itemTitle', async () => {
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments?method=card'));
    const json = await res.json();
    const examPay = json.data.payments.find((p: any) => p._id?.toString() === String(payExam._id));
    expect(examPay).toBeTruthy();
    expect(examPay.itemType).toBe('exam');
  });

  it('never returns user password in response', async () => {
    const { GET } = await adminPaymentsApi();
    const res = await GET(mockRequest('/api/admin/payments'));
    const json = await res.json();
    for (const p of json.data.payments) {
      if (p.user) {
        expect(p.user.password).toBeUndefined();
      }
    }
  });
});
