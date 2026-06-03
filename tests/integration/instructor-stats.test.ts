/**
 * Integration tests — /api/instructor/stats
 *
 * Pentest/QA focus:
 *  - RBAC: only instructor / admin
 *  - Owner scoping: an instructor sees ONLY their own courses+exams (cross-instructor leak prevention)
 *  - Aggregation correctness:
 *      • totalEnrollments counts active enrollments on instructor's courses
 *      • totalRevenue sums payments linked to active enrollments (not refunded/pending)
 *      • coursePerformance & examPerformance scoped to the instructor
 *      • passRate & avgScore math
 *  - Trend buckets: 6 most-recent months returned even when empty
 *  - No password leakage in populated user/recentEnrollments
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { makeUser, makeCourse, makeEnrollment, makePayment, makeExam, makeAttempt } from './factories';
import { setCurrentUser, clearCurrentUser } from './auth-mock';

async function statsApi() { return import('@/app/api/instructor/stats/route'); }
const URL_STATS = 'http://localhost/api/instructor/stats';
const getReq = () => new NextRequest(new URL(URL_STATS));

describe('GET /api/instructor/stats', () => {
  let admin: any, instr1: any, instr2: any, student1: any, student2: any;
  let course1: any, course2: any, otherCourse: any;
  let exam1: any;

  beforeEach(async () => {
    admin    = await makeUser({ role: 'admin' });
    instr1   = await makeUser({ role: 'instructor' });
    instr2   = await makeUser({ role: 'instructor' });
    student1 = await makeUser({ role: 'student' });
    student2 = await makeUser({ role: 'student' });

    // instr1 owns 2 courses + 1 exam
    course1 = await makeCourse({ instructor: instr1._id, price: 100, isPublished: true });
    course2 = await makeCourse({ instructor: instr1._id, price: 0,   isPublished: false });
    exam1   = await makeExam({ createdBy: instr1._id, course: course1._id });

    // instr2 owns a separate course (must NOT show up in instr1's stats)
    otherCourse = await makeCourse({ instructor: instr2._id, price: 200, isPublished: true });
  });

  it('rejects students with 403', async () => {
    setCurrentUser({ id: String(student1._id), role: 'student' });
    const { GET } = await statsApi();
    expect((await GET(getReq())).status).toBe(403);
  });

  it('rejects unauthenticated with 401', async () => {
    clearCurrentUser();
    const { GET } = await statsApi();
    expect((await GET(getReq())).status).toBe(401);
  });

  it('admin can also view (allowedRoles=instructor,admin)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await statsApi();
    expect((await GET(getReq())).status).toBe(200);
  });

  it('instructor sees their courses but not other instructors\' courses', async () => {
    setCurrentUser({ id: String(instr1._id), role: 'instructor' });
    const { GET } = await statsApi();
    const json = await (await GET(getReq())).json();

    expect(json.data.stats.totalCourses).toBe(2);
    expect(json.data.stats.publishedCourses).toBe(1);

    const titles = json.data.courses.map((c: any) => c.title);
    expect(titles).toEqual(expect.arrayContaining([course1.title, course2.title]));
    expect(titles).not.toContain(otherCourse.title);
  });

  it('totalEnrollments only counts ACTIVE enrollments on the instructor\'s courses', async () => {
    // 2 active in course1, 1 cancelled in course2, 1 in OTHER instructor's course
    const pay1 = await makePayment({ user: student1._id, course: course1._id, amount: 100, status: 'paid' });
    await makeEnrollment({ user: student1._id, course: course1._id, payment: pay1._id, status: 'active' });
    const pay2 = await makePayment({ user: student2._id, course: course1._id, amount: 100, status: 'paid' });
    await makeEnrollment({ user: student2._id, course: course1._id, payment: pay2._id, status: 'active' });
    await makeEnrollment({ user: student1._id, course: course2._id, status: 'cancelled' });
    const otherPay = await makePayment({ user: student1._id, course: otherCourse._id, amount: 200, status: 'paid' });
    await makeEnrollment({ user: student1._id, course: otherCourse._id, payment: otherPay._id, status: 'active' });

    setCurrentUser({ id: String(instr1._id), role: 'instructor' });
    const { GET } = await statsApi();
    const json = await (await GET(getReq())).json();

    expect(json.data.stats.totalEnrollments).toBe(2); // active only, in instructor's courses only
  });

  it('totalRevenue sums only PAID payments tied to active enrollments', async () => {
    const okPay = await makePayment({ user: student1._id, course: course1._id, amount: 150, status: 'paid' });
    await makeEnrollment({ user: student1._id, course: course1._id, payment: okPay._id, status: 'active' });

    // refunded payment with active enrollment → not included
    const refunded = await makePayment({ user: student2._id, course: course1._id, amount: 999, status: 'refunded' });
    await makeEnrollment({ user: student2._id, course: course1._id, payment: refunded._id, status: 'active' });

    setCurrentUser({ id: String(instr1._id), role: 'instructor' });
    const { GET } = await statsApi();
    const json = await (await GET(getReq())).json();

    expect(json.data.stats.totalRevenue).toBe(150);
  });

  it('coursePerformance carries enrollments + revenue per course', async () => {
    const pay = await makePayment({ user: student1._id, course: course1._id, amount: 100, status: 'paid' });
    await makeEnrollment({ user: student1._id, course: course1._id, payment: pay._id, status: 'active', progress: 40 });

    setCurrentUser({ id: String(instr1._id), role: 'instructor' });
    const { GET } = await statsApi();
    const json = await (await GET(getReq())).json();

    const c1Perf = json.data.analytics.coursePerformance.find((c: any) => String(c.courseId) === String(course1._id));
    expect(c1Perf).toBeTruthy();
    expect(c1Perf.enrollments).toBe(1);
    expect(c1Perf.revenue).toBe(100);
    expect(c1Perf.avgProgress).toBe(40);
  });

  it('examPerformance carries attempts/avgScore/passRate per exam', async () => {
    await makeAttempt({ user: student1._id, exam: exam1._id, status: 'submitted', score: 80, passed: true,  attemptNumber: 1 });
    await makeAttempt({ user: student2._id, exam: exam1._id, status: 'submitted', score: 40, passed: false, attemptNumber: 1 });

    setCurrentUser({ id: String(instr1._id), role: 'instructor' });
    const { GET } = await statsApi();
    const json = await (await GET(getReq())).json();

    const ePerf = json.data.analytics.examPerformance.find((e: any) => String(e.examId) === String(exam1._id));
    expect(ePerf).toBeTruthy();
    expect(ePerf.attempts).toBe(2);
    expect(ePerf.avgScore).toBe(60); // (80+40)/2
    expect(ePerf.passRate).toBe(50); // 1/2 passed → 50%
  });

  it('analytics trend buckets always have 6 monthly entries (even when no data)', async () => {
    setCurrentUser({ id: String(instr1._id), role: 'instructor' });
    const { GET } = await statsApi();
    const json = await (await GET(getReq())).json();
    expect(json.data.analytics.revenueTrend).toHaveLength(6);
    expect(json.data.analytics.paymentsTrend).toHaveLength(6);
    expect(json.data.analytics.enrollmentsTrend).toHaveLength(6);
    expect(json.data.analytics.attemptsTrend).toHaveLength(6);
  });

  it('recentEnrollments is capped at 10 and never leaks user.password', async () => {
    // Create 12 enrollments
    for (let i = 0; i < 12; i++) {
      const u = await makeUser({ role: 'student' });
      const p = await makePayment({ user: u._id, course: course1._id, amount: 100, status: 'paid' });
      await makeEnrollment({ user: u._id, course: course1._id, payment: p._id, status: 'active' });
    }
    setCurrentUser({ id: String(instr1._id), role: 'instructor' });
    const { GET } = await statsApi();
    const json = await (await GET(getReq())).json();

    expect(json.data.recentEnrollments.length).toBeLessThanOrEqual(10);
    for (const e of json.data.recentEnrollments) {
      expect(e.user?.password).toBeUndefined();
    }
  });
});
