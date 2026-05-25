import { describe, it, expect, beforeEach } from 'vitest';
import {
  makeUser,
  makeCourse,
  makeEnrollment,
  makePayment,
  makeExam,
  makeAttempt,
} from './factories';
import { setCurrentUser, mockRequest } from './auth-mock';

// We import the route handler modules dynamically AFTER setup has run.
async function adminStatsGet() {
  const mod = await import('@/app/api/admin/stats/route');
  return mod.GET;
}
async function instructorStatsGet() {
  const mod = await import('@/app/api/instructor/stats/route');
  return mod.GET;
}

async function call(handler: any, url: string) {
  const res = await handler(mockRequest(url));
  return res.json();
}

describe('Admin dashboard stats — totals reflect seeded data', () => {
  let admin: any;
  let instA: any;
  let instB: any;
  let stu1: any;
  let stu2: any;
  let stu3: any;
  let stu4: any;
  let courseFreeA: any;       // instA, free, published, beginner
  let coursePaidA: any;       // instA, 100 EGP, published, intermediate
  let coursePaidB: any;       // instB, 200 EGP, published, advanced
  let courseUnpubA: any;      // instA, unpublished
  let examPaid: any;          // instB, paid 50 EGP, linked to coursePaidB

  beforeEach(async () => {
    // === Seed: 4 user roles & levels ===
    admin = await makeUser({ role: 'admin', name: 'Admin' });
    instA = await makeUser({ role: 'instructor', name: 'Instr A' });
    instB = await makeUser({ role: 'instructor', name: 'Instr B' });
    stu1 = await makeUser({ role: 'student', name: 'Stu1', academicYear: 'grade1_secondary' });
    stu2 = await makeUser({ role: 'student', name: 'Stu2', academicYear: 'grade1_secondary' });
    stu3 = await makeUser({ role: 'student', name: 'Stu3', academicYear: 'grade2_secondary' });
    stu4 = await makeUser({ role: 'student', name: 'Stu4', academicYear: 'grade4_primary', isActive: false });

    // === Seed: 4 courses with different types/levels/publish status ===
    courseFreeA   = await makeCourse({ instructor: instA._id, title: 'FreeA',   price: 0,   level: 'beginner',     isPublished: true });
    coursePaidA   = await makeCourse({ instructor: instA._id, title: 'PaidA',   price: 100, level: 'intermediate', isPublished: true });
    coursePaidB   = await makeCourse({ instructor: instB._id, title: 'PaidB',   price: 200, level: 'advanced',     isPublished: true });
    courseUnpubA  = await makeCourse({ instructor: instA._id, title: 'UnpubA',  price: 50,  level: 'beginner',     isPublished: false });

    // === Seed: exam tied to coursePaidB ===
    examPaid = await makeExam({ createdBy: instB._id, course: coursePaidB._id, price: 50, accessType: 'paid' });

    // === Seed: enrollments with varied progress (0/25/50/75/100) ===
    // PaidA: stu1 (paid card) 50%, stu2 (paid wallet) 100%, stu3 (paid card) 25%, stu4 (pending — should be excluded from active)
    const payA1 = await makePayment({ user: stu1._id, course: coursePaidA._id, amount: 100, method: 'card',   status: 'paid' });
    const payA2 = await makePayment({ user: stu2._id, course: coursePaidA._id, amount: 100, method: 'wallet', status: 'paid' });
    const payA3 = await makePayment({ user: stu3._id, course: coursePaidA._id, amount: 100, method: 'fawry',  status: 'paid' });
    await makeEnrollment({ user: stu1._id, course: coursePaidA._id, payment: payA1._id, status: 'active', progress: 50 });
    await makeEnrollment({ user: stu2._id, course: coursePaidA._id, payment: payA2._id, status: 'active', progress: 100 });
    await makeEnrollment({ user: stu3._id, course: coursePaidA._id, payment: payA3._id, status: 'active', progress: 25 });

    // PaidB: stu1 (paid card) 0%, stu2 (paid card) 75%
    const payB1 = await makePayment({ user: stu1._id, course: coursePaidB._id, amount: 200, method: 'card', status: 'paid' });
    const payB2 = await makePayment({ user: stu2._id, course: coursePaidB._id, amount: 200, method: 'card', status: 'paid' });
    await makeEnrollment({ user: stu1._id, course: coursePaidB._id, payment: payB1._id, status: 'active', progress: 0 });
    await makeEnrollment({ user: stu2._id, course: coursePaidB._id, payment: payB2._id, status: 'active', progress: 75 });

    // FreeA: stu3 enrolled free (no payment), 60%
    await makeEnrollment({ user: stu3._id, course: courseFreeA._id, status: 'active', progress: 60 });

    // A pending enrollment & a failed payment that MUST be excluded from "active"/"paid" totals.
    await makePayment({ user: stu4._id, course: coursePaidA._id, amount: 100, method: 'card', status: 'failed' });
    await makeEnrollment({ user: stu4._id, course: coursePaidA._id, status: 'pending', progress: 0 });

    // === Seed: exam attempts — mix of in-progress (excluded), submitted-passed, submitted-failed, timed-out ===
    await makeAttempt({ user: stu1._id, exam: examPaid._id, status: 'submitted', score: 90, passed: true });
    await makeAttempt({ user: stu2._id, exam: examPaid._id, status: 'submitted', score: 50, passed: false });
    await makeAttempt({ user: stu3._id, exam: examPaid._id, status: 'timed-out', score: 30, passed: false, attemptNumber: 2 });
    await makeAttempt({ user: stu1._id, exam: examPaid._id, status: 'in-progress', attemptNumber: 2 }); // excluded

    // Exam payment (paid 50 EGP × 1)
    await makePayment({ user: stu1._id, exam: examPaid._id, amount: 50, method: 'card', status: 'paid' });
  });

  it('returns correct global totals (users / courses / exams / enrollments / revenue)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const handler = await adminStatsGet();
    const json = await call(handler, '/api/admin/stats');
    expect(json.success).toBe(true);

    const s = json.data.stats;
    // 1 admin + 2 instructors + 4 students = 7 users
    expect(s.totalUsers).toBe(7);
    expect(s.totalStudents).toBe(4);
    expect(s.totalInstructors).toBe(2);
    expect(s.totalCourses).toBe(4);
    expect(s.publishedCourses).toBe(3);
    expect(s.totalExams).toBe(1);

    // Active enrollments: 3 (PaidA) + 2 (PaidB) + 1 (FreeA) = 6. Pending excluded.
    expect(s.totalEnrollments).toBe(6);

    // submitted+timed-out attempts only (in-progress excluded) = 3
    expect(s.totalExamAttempts).toBe(3);

    // Revenue: 3×100 (PaidA) + 2×200 (PaidB) + 1×50 (exam) = 750. Failed payment excluded.
    expect(s.totalRevenue).toBe(750);
  });

  it('produces correct per-course performance (enrollments + avgProgress + revenue)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const handler = await adminStatsGet();
    const json = await call(handler, '/api/admin/stats');

    const perf: any[] = json.data.analytics.coursePerformance;
    const byTitle = Object.fromEntries(perf.map(p => [p.title, p]));

    expect(byTitle['PaidA'].enrollments).toBe(3);
    // avg(50, 100, 25) = 58.33 → rounded 58
    expect(byTitle['PaidA'].avgProgress).toBe(58);
    expect(byTitle['PaidA'].revenue).toBe(300);
    expect(byTitle['PaidA'].paymentsCount).toBe(3);

    expect(byTitle['PaidB'].enrollments).toBe(2);
    expect(byTitle['PaidB'].avgProgress).toBe(38); // avg(0,75)=37.5 → 38
    expect(byTitle['PaidB'].revenue).toBe(400);

    expect(byTitle['FreeA'].enrollments).toBe(1);
    expect(byTitle['FreeA'].avgProgress).toBe(60);
    expect(byTitle['FreeA'].revenue).toBe(0);

    // Unpublished course has no enrollments / revenue
    expect(byTitle['UnpubA'].enrollments).toBe(0);
    expect(byTitle['UnpubA'].revenue).toBe(0);
    expect(byTitle['UnpubA'].isPublished).toBe(false);
  });

  it('produces correct exam performance (attempts / avgScore / passRate / revenue)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const handler = await adminStatsGet();
    const json = await call(handler, '/api/admin/stats');

    const perf: any[] = json.data.analytics.examPerformance;
    expect(perf).toHaveLength(1);
    const e = perf[0];
    expect(e.attempts).toBe(3); // 2 submitted + 1 timed-out, in-progress excluded
    // avg(90, 50, 30) = 56.67 → 57
    expect(e.avgScore).toBe(57);
    // 1 of 3 passed → 33%
    expect(e.passRate).toBe(33);
    expect(e.revenue).toBe(50);
    expect(e.courseTitle).toBe('PaidB');
  });

  it('returns 6 month trend buckets with totals matching seeded payments', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const handler = await adminStatsGet();
    const json = await call(handler, '/api/admin/stats');

    const t = json.data.analytics;
    expect(t.revenueTrend).toHaveLength(6);
    expect(t.paymentsTrend).toHaveLength(6);
    expect(t.enrollmentsTrend).toHaveLength(6);
    expect(t.attemptsTrend).toHaveLength(6);

    const totalRev = t.revenueTrend.reduce((sum: number, m: any) => sum + m.revenue, 0);
    expect(totalRev).toBe(750);
    const totalPayments = t.paymentsTrend.reduce((sum: number, m: any) => sum + m.payments, 0);
    expect(totalPayments).toBe(6); // all 6 paid payments
    const totalEnrollTrend = t.enrollmentsTrend.reduce((sum: number, m: any) => sum + m.enrollments, 0);
    expect(totalEnrollTrend).toBe(6);
    const totalAttemptsTrend = t.attemptsTrend.reduce((sum: number, m: any) => sum + m.attempts, 0);
    expect(totalAttemptsTrend).toBe(3);
  });

  it('rejects a non-admin user', async () => {
    setCurrentUser({ id: String(instA._id), role: 'instructor' });
    const handler = await adminStatsGet();
    const res = await handler(mockRequest('/api/admin/stats'));
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request', async () => {
    setCurrentUser(null);
    const handler = await adminStatsGet();
    const res = await handler(mockRequest('/api/admin/stats'));
    expect(res.status).toBe(401);
  });

  it('rejects a deactivated user even with a valid JWT', async () => {
    setCurrentUser({ id: String(stu4._id), role: 'student' }); // isActive=false
    const handler = await adminStatsGet();
    const res = await handler(mockRequest('/api/admin/stats'));
    expect(res.status).toBe(403);
  });
});

describe('Instructor stats — scoped to that instructor only', () => {
  let instA: any;
  let instB: any;
  let stu1: any;
  let stu2: any;
  let coursePaidA: any;
  let coursePaidB: any;
  let examA: any;

  beforeEach(async () => {
    instA = await makeUser({ role: 'instructor', name: 'IA' });
    instB = await makeUser({ role: 'instructor', name: 'IB' });
    stu1 = await makeUser({ role: 'student' });
    stu2 = await makeUser({ role: 'student' });

    coursePaidA = await makeCourse({ instructor: instA._id, title: 'A-course', price: 100, isPublished: true });
    coursePaidB = await makeCourse({ instructor: instB._id, title: 'B-course', price: 200, isPublished: true });

    examA = await makeExam({ createdBy: instA._id, course: coursePaidA._id, price: 0 });
    // exam owned by instB (must not show up in instA's stats)
    await makeExam({ createdBy: instB._id, course: coursePaidB._id, price: 0 });

    // instA gets 2 enrollments / 2 payments
    const p1 = await makePayment({ user: stu1._id, course: coursePaidA._id, amount: 100, status: 'paid' });
    const p2 = await makePayment({ user: stu2._id, course: coursePaidA._id, amount: 100, status: 'paid' });
    await makeEnrollment({ user: stu1._id, course: coursePaidA._id, payment: p1._id, progress: 40 });
    await makeEnrollment({ user: stu2._id, course: coursePaidA._id, payment: p2._id, progress: 80 });

    // instB gets a payment that must NOT leak into instA's stats
    const pB = await makePayment({ user: stu1._id, course: coursePaidB._id, amount: 200, status: 'paid' });
    await makeEnrollment({ user: stu1._id, course: coursePaidB._id, payment: pB._id, progress: 10 });

    // exam attempts for instA's exam
    await makeAttempt({ user: stu1._id, exam: examA._id, status: 'submitted', score: 80, passed: true });
    await makeAttempt({ user: stu2._id, exam: examA._id, status: 'submitted', score: 40, passed: false });
  });

  it('returns ONLY the calling instructor\'s data', async () => {
    setCurrentUser({ id: String(instA._id), role: 'instructor' });
    const handler = await instructorStatsGet();
    const json = await call(handler, '/api/instructor/stats');
    expect(json.success).toBe(true);

    const s = json.data.stats;
    expect(s.totalEnrollments).toBe(2);
    expect(s.totalRevenue).toBe(200); // 2 × 100; instB's 200 must NOT leak
    expect(s.totalExamAttempts).toBe(2);

    const courses = json.data.analytics.coursePerformance;
    expect(courses).toHaveLength(1);
    expect(courses[0].title).toBe('A-course');
    expect(courses[0].avgProgress).toBe(60); // avg(40,80)
  });

  it('shows different data for instB than for instA', async () => {
    setCurrentUser({ id: String(instB._id), role: 'instructor' });
    const handler = await instructorStatsGet();
    const json = await call(handler, '/api/instructor/stats');
    expect(json.data.stats.totalRevenue).toBe(200);
    expect(json.data.stats.totalEnrollments).toBe(1);
    expect(json.data.analytics.coursePerformance[0].title).toBe('B-course');
  });
});
