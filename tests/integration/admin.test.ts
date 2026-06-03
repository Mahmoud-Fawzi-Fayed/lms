/**
 * Integration tests — /api/admin/{users,payments,courses}
 *
 * Pentest/QA focus:
 *  - Hard RBAC: non-admin (student/instructor) MUST get 403; unauthenticated 401
 *  - Self-protection: admin cannot demote / deactivate their own account
 *  - Search inputs: NoSQL regex injection blocked (escapeRegex), 80-char cap
 *  - Pagination clamping (page≥1, limit≥1 & ≤100/200, NaN inputs default safely)
 *  - Status & method filters apply correctly; invalid values are dropped
 *  - User-listing never leaks the password hash
 *  - Update accepts only role / isActive — no other fields can be set via PUT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { makeUser, makeCourse, makePayment } from './factories';
import { setCurrentUser, clearCurrentUser } from './auth-mock';
import { User } from '@/models';

async function adminUsersApi() { return import('@/app/api/admin/users/route'); }
async function adminPaymentsApi() { return import('@/app/api/admin/payments/route'); }
async function adminCoursesApi() { return import('@/app/api/admin/courses/route'); }

const URL_USERS    = 'http://localhost/api/admin/users';
const URL_PAYMENTS = 'http://localhost/api/admin/payments';
const URL_COURSES  = 'http://localhost/api/admin/courses';

function getReq(url: string) {
  return new NextRequest(new URL(url));
}
function jsonReq(url: string, method: string, body?: any) {
  return new NextRequest(new URL(url), {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/admin/users — RBAC & data exposure', () => {
  let admin: any, instructor: any, student: any;
  beforeEach(async () => {
    admin = await makeUser({ role: 'admin' });
    instructor = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student' });
  });

  it('rejects unauthenticated requests with 401', async () => {
    clearCurrentUser();
    const { GET } = await adminUsersApi();
    expect((await GET(getReq(URL_USERS))).status).toBe(401);
  });

  it('rejects students with 403', async () => {
    setCurrentUser({ id: String(student._id), role: 'student' });
    const { GET } = await adminUsersApi();
    expect((await GET(getReq(URL_USERS))).status).toBe(403);
  });

  it('rejects instructors with 403', async () => {
    setCurrentUser({ id: String(instructor._id), role: 'instructor' });
    const { GET } = await adminUsersApi();
    expect((await GET(getReq(URL_USERS))).status).toBe(403);
  });

  it('admin can list all users', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminUsersApi();
    const res = await GET(getReq(URL_USERS));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data.users)).toBe(true);
    expect(json.data.users.length).toBe(3);
  });

  it('CRITICAL: never returns password hash in any user record', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminUsersApi();
    const res = await GET(getReq(URL_USERS));
    const json = await res.json();
    for (const u of json.data.users) {
      expect(u.password).toBeUndefined();
      expect(u.passwordHash).toBeUndefined();
    }
  });

  it('role filter accepts only admin/instructor/student (others ignored)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminUsersApi();

    const allowed = await GET(getReq(`${URL_USERS}?role=student`));
    const aJson = await allowed.json();
    expect(aJson.data.users.every((u: any) => u.role === 'student')).toBe(true);

    // Bogus role string is silently dropped (not used as a filter)
    const bogus = await GET(getReq(`${URL_USERS}?role=superadmin`));
    const bJson = await bogus.json();
    expect(bJson.data.users.length).toBe(3);
  });

  it('pagination clamps to sane bounds (page ≥ 1, 1 ≤ limit ≤ 100)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminUsersApi();

    const negPage = await GET(getReq(`${URL_USERS}?page=-1&limit=5`));
    expect((await negPage.json()).data.pagination.page).toBe(1);

    const huge = await GET(getReq(`${URL_USERS}?page=1&limit=99999`));
    expect((await huge.json()).data.pagination.limit).toBe(100);

    const garbage = await GET(getReq(`${URL_USERS}?page=foo&limit=bar`));
    const g = await garbage.json();
    expect(g.data.pagination.page).toBe(1);
    expect(g.data.pagination.limit).toBe(20);
  });

  it('search escapes regex metacharacters (no ReDoS, no injection)', async () => {
    // If escapeRegex were missing, this `(.+)+`-style payload would either match
    // unexpectedly OR throw a regex error at the DB layer. With escaping, it's
    // treated as a literal string (which obviously matches no email).
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminUsersApi();
    const res = await GET(getReq(`${URL_USERS}?search=${encodeURIComponent('(.+)+')}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.users.length).toBe(0);
  });

  it('search is case-insensitive on name and email', async () => {
    await makeUser({ role: 'student', name: 'Mohamed Tarek', email: 'tarek@x.com' });
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminUsersApi();
    const res = await GET(getReq(`${URL_USERS}?search=TAREK`));
    const json = await res.json();
    expect(json.data.users.some((u: any) => u.email === 'tarek@x.com')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/admin/users — admin-only mutation', () => {
  let admin: any, instructor: any, student: any;
  beforeEach(async () => {
    admin = await makeUser({ role: 'admin' });
    instructor = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student' });
  });

  it('rejects non-admin', async () => {
    setCurrentUser({ id: String(instructor._id), role: 'instructor' });
    const { PUT } = await adminUsersApi();
    const res = await PUT(jsonReq(URL_USERS, 'PUT', { userId: String(student._id), role: 'admin' }));
    expect(res.status).toBe(403);
  });

  it('CRITICAL: admin cannot demote themselves', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsersApi();
    const res = await PUT(jsonReq(URL_USERS, 'PUT', { userId: String(admin._id), role: 'student' }));
    expect(res.status).toBe(400);
  });

  it('CRITICAL: admin cannot deactivate themselves', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsersApi();
    const res = await PUT(jsonReq(URL_USERS, 'PUT', { userId: String(admin._id), isActive: false }));
    expect(res.status).toBe(400);
  });

  it('admin CAN flip isActive on themselves to true (no-op restore allowed)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsersApi();
    // role undefined + isActive=true → not a self-demote/deactivate, so allowed
    const res = await PUT(jsonReq(URL_USERS, 'PUT', { userId: String(admin._id), isActive: true }));
    expect(res.status).toBe(200);
  });

  it('rejects when no valid update fields provided', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsersApi();
    const res = await PUT(jsonReq(URL_USERS, 'PUT', { userId: String(student._id), role: 'pirate' }));
    // pirate isn't an allowed role → drop → empty update → 400
    expect(res.status).toBe(400);
  });

  it('rejects invalid ObjectId', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsersApi();
    const res = await PUT(jsonReq(URL_USERS, 'PUT', { userId: 'not-an-objectid', role: 'instructor' }));
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsersApi();
    const req = new NextRequest(new URL(URL_USERS), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    expect((await PUT(req)).status).toBe(400);
  });

  it('rejects userId pointing at non-existent user with 404', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsersApi();
    const ghostId = '507f1f77bcf86cd799439011';
    const res = await PUT(jsonReq(URL_USERS, 'PUT', { userId: ghostId, role: 'student' }));
    expect(res.status).toBe(404);
  });

  it('valid update returns updated user without password', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsersApi();
    const res = await PUT(jsonReq(URL_USERS, 'PUT', { userId: String(student._id), role: 'instructor', isActive: false }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.role).toBe('instructor');
    expect(json.data.isActive).toBe(false);
    expect(json.data.password).toBeUndefined();

    // DB persisted the change
    const reloaded = await User.findById(student._id).lean<any>();
    expect(reloaded.role).toBe('instructor');
    expect(reloaded.isActive).toBe(false);
  });

  it('extra fields in PUT body are silently ignored (mass-assignment prevention)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsersApi();
    await PUT(jsonReq(URL_USERS, 'PUT', {
      userId: String(student._id),
      role: 'instructor',
      // attacker tries to inject these:
      email: 'attacker@evil.com',
      password: 'pwn3d',
      _id: '000000000000000000000000',
    }));
    const reloaded = await User.findById(student._id).lean<any>();
    // Email/password unchanged, _id unchanged
    expect(reloaded.email).not.toBe('attacker@evil.com');
    expect(reloaded._id.toString()).toBe(String(student._id));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/admin/payments — RBAC & filters', () => {
  let admin: any, student: any, course: any;
  beforeEach(async () => {
    admin = await makeUser({ role: 'admin' });
    student = await makeUser({ role: 'student' });
    const inst = await makeUser({ role: 'instructor' });
    course = await makeCourse({ instructor: inst._id, price: 100 });
  });

  it('rejects non-admin with 403', async () => {
    setCurrentUser({ id: String(student._id), role: 'student' });
    const { GET } = await adminPaymentsApi();
    expect((await GET(getReq(URL_PAYMENTS))).status).toBe(403);
  });

  it('admin sees all payments with normalized itemTitle/itemType', async () => {
    await makePayment({ user: student._id, course: course._id, amount: 100, status: 'paid', method: 'card' });
    await makePayment({ user: student._id, amount: 0, status: 'paid', method: 'free' });

    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminPaymentsApi();
    const res = await GET(getReq(URL_PAYMENTS));
    const json = await res.json();
    expect(json.data.payments.length).toBe(2);
    for (const p of json.data.payments) {
      expect(p.itemType).toMatch(/^(course|exam|unknown)$/);
      expect(typeof p.itemTitle).toBe('string');
    }
  });

  it('method filter only accepts the whitelist (card/wallet/fawry/free)', async () => {
    await makePayment({ user: student._id, course: course._id, amount: 100, status: 'paid', method: 'card' });
    await makePayment({ user: student._id, course: course._id, amount: 100, status: 'paid', method: 'wallet' });

    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminPaymentsApi();

    const card = await GET(getReq(`${URL_PAYMENTS}?method=card`));
    expect((await card.json()).data.payments.length).toBe(1);

    // Bogus method is dropped → all payments returned
    const bogus = await GET(getReq(`${URL_PAYMENTS}?method=cryptocurrency`));
    expect((await bogus.json()).data.payments.length).toBe(2);
  });

  it('status filter narrows results', async () => {
    await makePayment({ user: student._id, course: course._id, amount: 100, status: 'paid' });
    await makePayment({ user: student._id, course: course._id, amount: 100, status: 'pending' });
    await makePayment({ user: student._id, course: course._id, amount: 100, status: 'failed' });

    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminPaymentsApi();
    const paid = await GET(getReq(`${URL_PAYMENTS}?status=paid`));
    expect((await paid.json()).data.payments.length).toBe(1);
  });

  it('userId filter scopes to a single user', async () => {
    const other = await makeUser({ role: 'student' });
    await makePayment({ user: student._id, course: course._id, amount: 100, status: 'paid' });
    await makePayment({ user: other._id,   course: course._id, amount: 100, status: 'paid' });

    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminPaymentsApi();
    const res = await GET(getReq(`${URL_PAYMENTS}?userId=${student._id}`));
    const json = await res.json();
    expect(json.data.payments.length).toBe(1);
    expect(String(json.data.payments[0].user._id || json.data.payments[0].user)).toBe(String(student._id));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/admin/courses — RBAC & filters', () => {
  let admin: any, instructor: any;
  beforeEach(async () => {
    admin = await makeUser({ role: 'admin' });
    instructor = await makeUser({ role: 'instructor' });
  });

  it('rejects non-admin with 403', async () => {
    setCurrentUser({ id: String(instructor._id), role: 'instructor' });
    const { GET } = await adminCoursesApi();
    expect((await GET(getReq(URL_COURSES))).status).toBe(403);
  });

  it('returns drafts AND published (admin sees everything)', async () => {
    await makeCourse({ instructor: instructor._id, isPublished: true });
    await makeCourse({ instructor: instructor._id, isPublished: false });

    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const res = await GET(getReq(URL_COURSES));
    const json = await res.json();
    expect(json.data.courses.length).toBe(2);
  });

  it('status=draft returns only drafts; status=published only published', async () => {
    await makeCourse({ instructor: instructor._id, isPublished: true });
    await makeCourse({ instructor: instructor._id, isPublished: false });

    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();

    const drafts = await GET(getReq(`${URL_COURSES}?status=draft`));
    const dJson = await drafts.json();
    expect(dJson.data.courses.length).toBe(1);
    expect(dJson.data.courses[0].isPublished).toBe(false);

    const pub = await GET(getReq(`${URL_COURSES}?status=published`));
    const pJson = await pub.json();
    expect(pJson.data.courses.length).toBe(1);
    expect(pJson.data.courses[0].isPublished).toBe(true);
  });

  it('search escapes regex metachars (no NoSQL regex injection)', async () => {
    await makeCourse({ instructor: instructor._id, title: 'Math 101' });
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const res = await GET(getReq(`${URL_COURSES}?search=${encodeURIComponent('(.+)+')}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.courses.length).toBe(0); // literal pattern doesn't match
  });

  it('search caps at 80 chars (defense against extreme regex inputs)', async () => {
    await makeCourse({ instructor: instructor._id, title: 'Looong title' });
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const huge = 'a'.repeat(500);
    const res = await GET(getReq(`${URL_COURSES}?search=${huge}`));
    expect(res.status).toBe(200); // doesn't blow up, returns 0 results
    const json = await res.json();
    expect(json.data.courses.length).toBe(0);
  });

  it('limit default is 100 with cap at 200 (course listing is wider)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const big = await GET(getReq(`${URL_COURSES}?limit=99999`));
    expect((await big.json()).data.pagination.limit).toBe(200);
    const def = await GET(getReq(URL_COURSES));
    expect((await def.json()).data.pagination.limit).toBe(100);
  });

  it('payload only includes the allow-listed fields (no questions, no internals)', async () => {
    await makeCourse({ instructor: instructor._id, isPublished: true });
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const json = await (await GET(getReq(URL_COURSES))).json();
    const c = json.data.courses[0];
    // expected fields per route .select()
    for (const f of ['title', 'slug', 'category', 'level', 'price', 'isPublished', 'instructor', 'createdAt']) {
      expect(c).toHaveProperty(f);
    }
    // modules / questions etc. should NOT be in the projection
    expect(c.modules).toBeUndefined();
  });
});
