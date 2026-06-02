/**
 * Integration tests for POST /api/auth/register
 *
 * Covers:
 *  - Registration without courses (account-only)
 *  - Invalid / non-existent / unpublished courseIds
 *  - Multi-course registration
 *  - Successful registration (paid + free courses)
 *  - subscriptionStatus forced to 'none'
 *  - Role always forced to 'student'
 *  - Duplicate email
 *  - Schema validation (password rules, agreeToSubscription, subscriptionMethod, academic term rules)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { makeUser, makeCourse } from './factories';
import { User } from '@/models';

// ─── helpers ──────────────────────────────────────────────────────────────────

let ipSeq = 1;

/** Build a POST /api/auth/register request with a unique src IP to avoid rate-limit interference */
function registerReq(body: Record<string, unknown>, ip?: string): NextRequest {
  const uniqueIp = ip ?? `10.0.${Math.floor(ipSeq / 255)}.${(ipSeq++ % 255) + 1}`;
  return new NextRequest(new URL('http://localhost/api/auth/register'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': uniqueIp,
    },
    body: JSON.stringify(body),
  });
}

const VALID_BASE = {
  name: 'Test Student',
  email: 'test@example.com',
  password: 'Password1',
  academicYear: 'grade4_primary',
  academicTerm: 'term1',
  agreeToSubscription: true,
} as const;

async function registerApi() {
  return import('@/app/api/auth/register/route');
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/register — course context guard', () => {
  let inst: any;
  let paidCourse: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    paidCourse = await makeCourse({ instructor: inst._id, price: 300, isPublished: true });
  });

  it('registers successfully without any courses (account-only)', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({ ...VALID_BASE }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.courseIds).toEqual([]);
  });

  it('rejects when courseIds contains an invalid ObjectId', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      courseIds: ['not-an-objectid'],
      subscriptionMethod: 'card',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it('rejects when courseIds contains a valid ObjectId but no matching course exists', async () => {
    const { POST } = await registerApi();
    const nonExistent = new mongoose.Types.ObjectId().toString();
    const res = await POST(registerReq({
      ...VALID_BASE,
      courseIds: [nonExistent],
      subscriptionMethod: 'card',
    }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it('rejects when the course exists but is not published', async () => {
    const draft = await makeCourse({ instructor: inst._id, price: 200, isPublished: false });
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      courseIds: [String(draft._id)],
      subscriptionMethod: 'card',
    }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it('rejects when courseIds is provided but subscriptionMethod is missing', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      courseIds: [String(paidCourse._id)],
      // No subscriptionMethod
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });
});

describe('POST /api/auth/register — successful registration', () => {
  let inst: any;
  let paidCourse: any;
  let freeCourse: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    paidCourse = await makeCourse({ instructor: inst._id, price: 300, isPublished: true });
    freeCourse = await makeCourse({ instructor: inst._id, price: 0, isPublished: true });
  });

  it('creates account with status 201 for a paid published course', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      courseIds: [String(paidCourse._id)],
      subscriptionMethod: 'card',
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.email).toBe(VALID_BASE.email);
  });

  it('always creates user with role=student regardless of any injected role', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      email: 'hacker@example.com',
      courseIds: [String(paidCourse._id)],
      subscriptionMethod: 'card',
      role: 'admin', // injected — must be ignored
    }));
    expect(res.status).toBe(201);
    const user = await User.findOne({ email: 'hacker@example.com' });
    expect(user?.role).toBe('student');
  });

  it('sets subscriptionStatus to "none" — not "active" — on creation', async () => {
    const { POST } = await registerApi();
    await POST(registerReq({
      ...VALID_BASE,
      courseIds: [String(paidCourse._id)],
      subscriptionMethod: 'card',
    }));
    const user = await User.findOne({ email: VALID_BASE.email });
    expect(user?.subscriptionStatus).toBe('none');
  });

  it('works for a free (price=0) published course', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      email: 'free@example.com',
      courseIds: [String(freeCourse._id)],
      subscriptionMethod: 'card',
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).success).toBe(true);
  });

  it('hashes the password — plain text is not stored', async () => {
    const { POST } = await registerApi();
    await POST(registerReq({
      ...VALID_BASE,
      courseIds: [String(paidCourse._id)],
      subscriptionMethod: 'card',
    }));
    const user = await User.findOne({ email: VALID_BASE.email }).select('+password');
    expect(user?.password).toBeDefined();
    expect(user?.password).not.toBe(VALID_BASE.password);
    expect(user?.password!.length).toBeGreaterThan(20); // bcrypt hash
  });

  it('returns courseIds array in the response so the client can initiate payment', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      courseIds: [String(paidCourse._id)],
      subscriptionMethod: 'card',
    }));
    const json = await res.json();
    expect(Array.isArray(json.data.courseIds)).toBe(true);
    expect(json.data.courseIds).toContain(String(paidCourse._id));
  });

  it('supports fawry as subscriptionMethod', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      email: 'fawry@example.com',
      courseIds: [String(paidCourse._id)],
      subscriptionMethod: 'fawry',
    }));
    expect(res.status).toBe(201);
  });

  it('supports wallet as subscriptionMethod', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      email: 'wallet@example.com',
      courseIds: [String(paidCourse._id)],
      subscriptionMethod: 'wallet',
    }));
    expect(res.status).toBe(201);
  });

  it('allows registration without courseIds (account-only, no payment required)', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      email: 'nocourse@example.com',
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.courseIds).toEqual([]);
  });
});

describe('POST /api/auth/register — multi-course registration', () => {
  let inst: any;
  let courseA: any;
  let courseB: any;
  let courseC: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    courseA = await makeCourse({ instructor: inst._id, price: 200, isPublished: true });
    courseB = await makeCourse({ instructor: inst._id, price: 300, isPublished: true });
    courseC = await makeCourse({ instructor: inst._id, price: 0, isPublished: true });
  });

  it('accepts two paid courses in a single registration', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      email: 'multi2@example.com',
      courseIds: [String(courseA._id), String(courseB._id)],
      subscriptionMethod: 'card',
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.courseIds).toHaveLength(2);
    expect(json.data.courseIds).toContain(String(courseA._id));
    expect(json.data.courseIds).toContain(String(courseB._id));
  });

  it('accepts three courses (paid + free mix) in a single registration', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      email: 'multi3@example.com',
      courseIds: [String(courseA._id), String(courseB._id), String(courseC._id)],
      subscriptionMethod: 'fawry',
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.courseIds).toHaveLength(3);
  });

  it('rejects if any of the courseIds is invalid', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      email: 'badmulti@example.com',
      courseIds: [String(courseA._id), 'not-valid'],
      subscriptionMethod: 'card',
    }));
    expect(res.status).toBe(400);
  });

  it('rejects if any of the courseIds is for an unpublished course', async () => {
    const draft = await makeCourse({ instructor: inst._id, price: 100, isPublished: false });
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      email: 'draftmulti@example.com',
      courseIds: [String(courseA._id), String(draft._id)],
      subscriptionMethod: 'card',
    }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/auth/register — duplicate & conflict', () => {
  let inst: any;
  let course: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    course = await makeCourse({ instructor: inst._id, price: 100, isPublished: true });
  });

  it('returns 409 when the email is already registered', async () => {
    await makeUser({ email: VALID_BASE.email, role: 'student' });
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      courseIds: [String(course._id)],
      subscriptionMethod: 'card',
    }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it('returns 409 for duplicate email even without courses', async () => {
    await makeUser({ email: 'dup@example.com', role: 'student' });
    const { POST } = await registerApi();
    const res = await POST(registerReq({ ...VALID_BASE, email: 'dup@example.com' }));
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/register — schema / validation rejections', () => {
  let inst: any;
  let course: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    course = await makeCourse({ instructor: inst._id, price: 100, isPublished: true });
  });

  const cases: Array<[string, Record<string, unknown>]> = [
    ['name too short (1 char)', { ...VALID_BASE, name: 'X' }],
    ['password missing uppercase', { ...VALID_BASE, password: 'password1' }],
    ['password missing lowercase', { ...VALID_BASE, password: 'PASSWORD1' }],
    ['password missing digit', { ...VALID_BASE, password: 'Passwordx' }],
    ['password too short', { ...VALID_BASE, password: 'Pass1' }],
    ['invalid email', { ...VALID_BASE, email: 'not-an-email' }],
    ['agreeToSubscription=false', { ...VALID_BASE, agreeToSubscription: false }],
    ['agreeToSubscription missing', { ...VALID_BASE, agreeToSubscription: undefined }],
    ['invalid subscriptionMethod', { ...VALID_BASE, subscriptionMethod: 'bitcoin' }],
    ['invalid academicYear', { ...VALID_BASE, academicYear: 'grade99_unknown' }],
    ['grade2_secondary must use full_year', { ...VALID_BASE, academicYear: 'grade2_secondary', academicTerm: 'term1' }],
    ['non-grade2 cannot use full_year', { ...VALID_BASE, academicYear: 'grade4_primary', academicTerm: 'full_year' }],
  ];

  for (const [label, body] of cases) {
    it(`rejects: ${label}`, async () => {
      const { POST } = await registerApi();
      // Use empty courseIds so course-guard doesn't shadow the validation error.
      // Exception: 'invalid subscriptionMethod' must NOT add subscriptionMethod:'card' to override it.
      const extra: Record<string, unknown> = { courseIds: [] };
      if (label === 'invalid subscriptionMethod') {
        extra.courseIds = [String(course._id)]; // courseIds present so subscriptionMethod IS validated
      }
      const res = await POST(registerReq({ ...body, ...extra }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    });
  }

  it('accepts grade2_secondary with full_year (valid combination)', async () => {
    const { POST } = await registerApi();
    const res = await POST(registerReq({
      ...VALID_BASE,
      email: 'grade2sec@example.com',
      academicYear: 'grade2_secondary',
      academicTerm: 'full_year',
      courseIds: [String(course._id)],
      subscriptionMethod: 'card',
    }));
    expect(res.status).toBe(201);
  });
});
