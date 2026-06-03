/**
 * Integration tests:
 *  - GET /api/payments/callback  (Paymob redirect handler — NO side effects)
 *  - GET /api/payments/pending   (user's unresolved course payments)
 *
 * Pentest/QA focus:
 *  • callback never mutates DB regardless of HMAC validity
 *  • callback redirects to course slug if mapped, else to dashboard
 *  • pending lists ONLY the caller's payments (scope leak prevention)
 *  • pending excludes courses where the user is already enrolled
 *  • pending dedupes per-course (latest only)
 *  • pending excludes exam payments
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { makeUser, makeCourse, makePayment, makeEnrollment, makeExam } from './factories';
import { setCurrentUser, clearCurrentUser } from './auth-mock';
import { Payment } from '@/models';

async function callbackApi() { return import('@/app/api/payments/callback/route'); }
async function pendingApi() { return import('@/app/api/payments/pending/route'); }

const URL_PENDING = 'http://localhost/api/payments/pending';

// Build the callback URL with a valid (or invalid) HMAC.
function buildCallbackUrl(params: Record<string, string>, opts?: { invalid?: boolean }) {
  const search = new URLSearchParams(params);
  const fields = [
    'amount_cents','created_at','currency','error_occured','has_parent_transaction',
    'id','integration_id','is_3d_secure','is_auth','is_capture','is_refunded',
    'is_standalone_payment','is_voided','order','owner','pending',
    'source_data.pan','source_data.sub_type','source_data.type','success',
  ];
  const concatenated = fields.map(f => params[f] ?? '').join('');
  const hmac = crypto
    .createHmac('sha512', process.env.PAYMOB_HMAC_SECRET || 'test-paymob-hmac-secret')
    .update(concatenated)
    .digest('hex');
  search.set('hmac', opts?.invalid ? 'a'.repeat(hmac.length) : hmac);
  return `http://localhost/api/payments/callback?${search.toString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/payments/callback — no-side-effect redirect', () => {
  let user: any, instructor: any, course: any, payment: any;

  beforeEach(async () => {
    user = await makeUser({ role: 'student' });
    instructor = await makeUser({ role: 'instructor' });
    course = await makeCourse({ instructor: instructor._id, price: 100 });
    payment = await makePayment({
      user: user._id, course: course._id,
      amount: 100, status: 'pending', method: 'card',
    });
  });

  function baseParams(overrides: Record<string, string> = {}) {
    return {
      amount_cents: '10000',
      created_at: '2024-01-01T00:00:00Z',
      currency: 'EGP',
      error_occured: 'false',
      has_parent_transaction: 'false',
      id: '1',
      integration_id: '1',
      is_3d_secure: 'true',
      is_auth: 'false',
      is_capture: 'false',
      is_refunded: 'false',
      is_standalone_payment: 'true',
      is_voided: 'false',
      order: String(payment._id),
      owner: 'someone',
      pending: 'false',
      'source_data.pan': '4111',
      'source_data.sub_type': 'M',
      'source_data.type': 'card',
      success: 'true',
      merchant_order_id: String(payment._id),
      ...overrides,
    };
  }

  it('valid HMAC + success=true → redirects to course slug with payment=success', async () => {
    const { GET } = await callbackApi();
    const url = buildCallbackUrl(baseParams());
    const res = await GET(new NextRequest(new URL(url)));
    expect([302, 307]).toContain(res.status);
    const loc = res.headers.get('location') || '';
    expect(loc).toContain(`/courses/${course.slug}`);
    expect(loc).toContain('payment=success');
  });

  it('pending=true → redirects with payment=pending', async () => {
    const { GET } = await callbackApi();
    const url = buildCallbackUrl(baseParams({ success: 'false', pending: 'true' }));
    const res = await GET(new NextRequest(new URL(url)));
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get('location')).toMatch(/payment=pending/);
  });

  it('failure (success=false, pending=false) → redirects with payment=failed', async () => {
    const { GET } = await callbackApi();
    const url = buildCallbackUrl(baseParams({ success: 'false', pending: 'false' }));
    const res = await GET(new NextRequest(new URL(url)));
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get('location')).toMatch(/payment=failed/);
  });

  it('CRITICAL: invalid HMAC still redirects but never mutates the payment row', async () => {
    const { GET } = await callbackApi();
    const url = buildCallbackUrl(baseParams(), { invalid: true });
    const res = await GET(new NextRequest(new URL(url)));
    expect([302, 307]).toContain(res.status);

    const reloaded = await Payment.findById(payment._id);
    // payment row stays unchanged: status pending, no paidAt
    expect(reloaded?.status).toBe('pending');
    expect(reloaded?.paidAt).toBeFalsy();
  });

  it('CRITICAL: success=true with valid HMAC does NOT mutate the payment (webhook is the source of truth)', async () => {
    const { GET } = await callbackApi();
    const url = buildCallbackUrl(baseParams());
    await GET(new NextRequest(new URL(url)));

    const reloaded = await Payment.findById(payment._id);
    expect(reloaded?.status).toBe('pending'); // still pending — only webhook flips this
  });

  it('falls back to dashboard redirect when merchant_order_id is missing', async () => {
    const { GET } = await callbackApi();
    const url = buildCallbackUrl(baseParams({ merchant_order_id: '' }));
    const res = await GET(new NextRequest(new URL(url)));
    expect(res.headers.get('location')).toMatch(/dashboard\/student/);
  });

  it('does not throw on unknown merchant_order_id — falls back to dashboard', async () => {
    const { GET } = await callbackApi();
    const url = buildCallbackUrl(baseParams({ merchant_order_id: '507f1f77bcf86cd799439011' }));
    const res = await GET(new NextRequest(new URL(url)));
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get('location')).toMatch(/dashboard\/student/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/payments/pending — user-scoped unresolved course payments', () => {
  let userA: any, userB: any, instructor: any, course1: any, course2: any;

  beforeEach(async () => {
    userA = await makeUser({ role: 'student' });
    userB = await makeUser({ role: 'student' });
    instructor = await makeUser({ role: 'instructor' });
    course1 = await makeCourse({ instructor: instructor._id, price: 100 });
    course2 = await makeCourse({ instructor: instructor._id, price: 200 });
  });

  it('rejects unauthenticated', async () => {
    clearCurrentUser();
    const { GET } = await pendingApi();
    expect((await GET(new NextRequest(new URL(URL_PENDING)))).status).toBe(401);
  });

  it('CRITICAL: only returns the caller\'s payments (scope leak prevention)', async () => {
    await makePayment({ user: userA._id, course: course1._id, amount: 100, status: 'pending' });
    await makePayment({ user: userB._id, course: course1._id, amount: 100, status: 'pending' });

    setCurrentUser({ id: String(userA._id), role: 'student' });
    const { GET } = await pendingApi();
    const json = await (await GET(new NextRequest(new URL(URL_PENDING)))).json();
    expect(json.data.payments).toHaveLength(1);
    expect(String(json.data.payments[0].user)).toBe(String(userA._id));
  });

  it('returns pending AND failed course payments', async () => {
    await makePayment({ user: userA._id, course: course1._id, amount: 100, status: 'pending' });
    await makePayment({ user: userA._id, course: course2._id, amount: 200, status: 'failed' });

    setCurrentUser({ id: String(userA._id), role: 'student' });
    const { GET } = await pendingApi();
    const json = await (await GET(new NextRequest(new URL(URL_PENDING)))).json();
    expect(json.data.payments).toHaveLength(2);
  });

  it('does NOT return paid payments', async () => {
    await makePayment({ user: userA._id, course: course1._id, amount: 100, status: 'paid' });

    setCurrentUser({ id: String(userA._id), role: 'student' });
    const { GET } = await pendingApi();
    const json = await (await GET(new NextRequest(new URL(URL_PENDING)))).json();
    expect(json.data.payments).toHaveLength(0);
  });

  it('CRITICAL: filters out courses where user is already enrolled (race-condition guard)', async () => {
    // failed payment exists, BUT enrollment also exists (e.g. webhook arrived later)
    const p = await makePayment({ user: userA._id, course: course1._id, amount: 100, status: 'failed' });
    await makeEnrollment({ user: userA._id, course: course1._id, payment: p._id, status: 'active' });

    setCurrentUser({ id: String(userA._id), role: 'student' });
    const { GET } = await pendingApi();
    const json = await (await GET(new NextRequest(new URL(URL_PENDING)))).json();
    // user can already access the course — don't show a "retry payment" CTA
    expect(json.data.payments).toHaveLength(0);
  });

  it('dedupes per course — keeps only the most recent payment when multiple pending exist', async () => {
    const old = new Date(Date.now() - 60_000);
    const newer = new Date();
    await makePayment({ user: userA._id, course: course1._id, amount: 100, status: 'pending', createdAt: old });
    await makePayment({ user: userA._id, course: course1._id, amount: 100, status: 'failed',  createdAt: newer });

    setCurrentUser({ id: String(userA._id), role: 'student' });
    const { GET } = await pendingApi();
    const json = await (await GET(new NextRequest(new URL(URL_PENDING)))).json();
    expect(json.data.payments).toHaveLength(1);
  });

  it('does NOT return exam-only payments (course-scoped endpoint)', async () => {
    const exam = await makeExam({ createdBy: instructor._id, accessType: 'paid', price: 50 });
    await makePayment({ user: userA._id, exam: exam._id, amount: 50, status: 'pending' });

    setCurrentUser({ id: String(userA._id), role: 'student' });
    const { GET } = await pendingApi();
    const json = await (await GET(new NextRequest(new URL(URL_PENDING)))).json();
    expect(json.data.payments).toHaveLength(0);
  });

  it('returns empty array (not error) when user has nothing pending', async () => {
    setCurrentUser({ id: String(userA._id), role: 'student' });
    const { GET } = await pendingApi();
    const json = await (await GET(new NextRequest(new URL(URL_PENDING)))).json();
    expect(json.data.payments).toEqual([]);
  });
});
