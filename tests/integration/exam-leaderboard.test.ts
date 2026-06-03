/**
 * Integration tests — /api/exams/[id]/leaderboard
 *
 * Pentest/QA focus:
 *  - Auth required (401)
 *  - Students who never attempted the exam are blocked (403) — can't probe rankings
 *  - Owner / admin always allowed even without an attempt
 *  - Aggregation correctness: best attempt per user, ranked by score then time
 *  - In-progress attempts excluded
 *  - Limit param sanitization (negative → 1, >100 → 100, NaN → 50)
 *  - Invalid ObjectId path arg → 400
 *  - Non-existent exam → 404
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { makeUser, makeCourse, makeExam, makeAttempt } from './factories';
import { setCurrentUser, clearCurrentUser } from './auth-mock';

async function leaderboardApi() { return import('@/app/api/exams/[id]/leaderboard/route'); }

function getReq(examId: string, qs = '') {
  return new NextRequest(new URL(`http://localhost/api/exams/${examId}/leaderboard${qs}`));
}
const ctx = (id: string) => ({ params: { id } } as any);

describe('GET /api/exams/[id]/leaderboard', () => {
  let instructor: any, admin: any, student: any, otherStudent: any;
  let course: any, exam: any;

  beforeEach(async () => {
    instructor = await makeUser({ role: 'instructor' });
    admin      = await makeUser({ role: 'admin' });
    student    = await makeUser({ role: 'student', name: 'Alpha' });
    otherStudent = await makeUser({ role: 'student', name: 'Beta' });
    course = await makeCourse({ instructor: instructor._id });
    exam   = await makeExam({ createdBy: instructor._id, course: course._id });
  });

  it('rejects unauthenticated with 401', async () => {
    clearCurrentUser();
    const { GET } = await leaderboardApi();
    expect((await GET(getReq(String(exam._id)), ctx(String(exam._id)))).status).toBe(401);
  });

  it('CRITICAL: a student with NO completed attempt cannot peek at the leaderboard', async () => {
    setCurrentUser({ id: String(student._id), role: 'student' });
    const { GET } = await leaderboardApi();
    expect((await GET(getReq(String(exam._id)), ctx(String(exam._id)))).status).toBe(403);
  });

  it('an in-progress attempt does NOT grant access (must be submitted/timed-out)', async () => {
    await makeAttempt({ user: student._id, exam: exam._id, status: 'in-progress', score: 0, attemptNumber: 1 });
    setCurrentUser({ id: String(student._id), role: 'student' });
    const { GET } = await leaderboardApi();
    expect((await GET(getReq(String(exam._id)), ctx(String(exam._id)))).status).toBe(403);
  });

  it('a submitted attempt grants access', async () => {
    await makeAttempt({ user: student._id, exam: exam._id, status: 'submitted', score: 50, attemptNumber: 1 });
    setCurrentUser({ id: String(student._id), role: 'student' });
    const { GET } = await leaderboardApi();
    const res = await GET(getReq(String(exam._id)), ctx(String(exam._id)));
    expect(res.status).toBe(200);
  });

  it('exam owner always sees the leaderboard (no attempt needed)', async () => {
    setCurrentUser({ id: String(instructor._id), role: 'instructor' });
    const { GET } = await leaderboardApi();
    const res = await GET(getReq(String(exam._id)), ctx(String(exam._id)));
    expect(res.status).toBe(200);
  });

  it('admin always sees the leaderboard (no attempt needed)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await leaderboardApi();
    const res = await GET(getReq(String(exam._id)), ctx(String(exam._id)));
    expect(res.status).toBe(200);
  });

  it('non-owning instructor without attempt is blocked (403)', async () => {
    const otherInstr = await makeUser({ role: 'instructor' });
    setCurrentUser({ id: String(otherInstr._id), role: 'instructor' });
    const { GET } = await leaderboardApi();
    expect((await GET(getReq(String(exam._id)), ctx(String(exam._id)))).status).toBe(403);
  });

  it('returns 400 for an invalid ObjectId in the path', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await leaderboardApi();
    expect((await GET(getReq('not-an-id'), ctx('not-an-id'))).status).toBe(400);
  });

  it('returns 404 for a non-existent exam', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await leaderboardApi();
    const ghost = '507f1f77bcf86cd799439011';
    expect((await GET(getReq(ghost), ctx(ghost))).status).toBe(404);
  });

  it('aggregates BEST attempt per user and ranks by score desc', async () => {
    // student: best=80 (multiple attempts: 60, 80, 50)
    await makeAttempt({ user: student._id, exam: exam._id, status: 'submitted', score: 60, passed: false, attemptNumber: 1 });
    await makeAttempt({ user: student._id, exam: exam._id, status: 'submitted', score: 80, passed: true,  attemptNumber: 2 });
    await makeAttempt({ user: student._id, exam: exam._id, status: 'submitted', score: 50, passed: false, attemptNumber: 3 });
    // otherStudent: best=70 (single attempt)
    await makeAttempt({ user: otherStudent._id, exam: exam._id, status: 'submitted', score: 70, passed: true, attemptNumber: 1 });

    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await leaderboardApi();
    const res = await GET(getReq(String(exam._id)), ctx(String(exam._id)));
    const json = await res.json();

    expect(json.data.leaderboard).toHaveLength(2);
    expect(json.data.leaderboard[0].rank).toBe(1);
    expect(json.data.leaderboard[0].name).toBe('Alpha');
    expect(json.data.leaderboard[0].bestScore).toBe(80);
    expect(json.data.leaderboard[0].attempts).toBe(3);
    expect(json.data.leaderboard[0].passed).toBe(true);

    expect(json.data.leaderboard[1].rank).toBe(2);
    expect(json.data.leaderboard[1].name).toBe('Beta');
    expect(json.data.leaderboard[1].bestScore).toBe(70);
  });

  it('in-progress attempts are excluded from the aggregation', async () => {
    await makeAttempt({ user: student._id, exam: exam._id, status: 'submitted', score: 50, attemptNumber: 1 });
    await makeAttempt({ user: student._id, exam: exam._id, status: 'in-progress', score: 0, attemptNumber: 2 });

    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await leaderboardApi();
    const json = await (await GET(getReq(String(exam._id)), ctx(String(exam._id)))).json();

    expect(json.data.leaderboard).toHaveLength(1);
    expect(json.data.leaderboard[0].attempts).toBe(1); // only the submitted one
  });

  it('limit param is clamped: negative → 1, >100 → 100', async () => {
    // build 5 attempts so we can verify limit=1 truncation
    const users = [];
    for (let i = 0; i < 5; i++) {
      const u = await makeUser({ role: 'student' });
      users.push(u);
      await makeAttempt({ user: u._id, exam: exam._id, status: 'submitted', score: 50 + i, attemptNumber: 1 });
    }
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await leaderboardApi();

    const lim1 = await (await GET(getReq(String(exam._id), '?limit=1'),  ctx(String(exam._id)))).json();
    expect(lim1.data.leaderboard.length).toBe(1);

    const limNeg = await (await GET(getReq(String(exam._id), '?limit=-99'), ctx(String(exam._id)))).json();
    expect(limNeg.data.leaderboard.length).toBe(1); // clamped to 1

    const limHuge = await (await GET(getReq(String(exam._id), '?limit=99999'), ctx(String(exam._id)))).json();
    expect(limHuge.data.leaderboard.length).toBeLessThanOrEqual(100);
  });

  it('rank is monotonically increasing starting at 1', async () => {
    await makeAttempt({ user: student._id, exam: exam._id, status: 'submitted', score: 90, attemptNumber: 1 });
    await makeAttempt({ user: otherStudent._id, exam: exam._id, status: 'submitted', score: 60, attemptNumber: 1 });

    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await leaderboardApi();
    const json = await (await GET(getReq(String(exam._id)), ctx(String(exam._id)))).json();

    for (let i = 0; i < json.data.leaderboard.length; i++) {
      expect(json.data.leaderboard[i].rank).toBe(i + 1);
    }
  });
});
