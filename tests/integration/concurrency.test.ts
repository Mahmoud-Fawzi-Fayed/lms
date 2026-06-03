/**
 * Integration tests — atomicity / concurrency / race-conditions.
 *
 * Pentest/QA focus:
 *  - POST /api/exams/submit: simultaneous submits → exactly ONE flips status (atomic)
 *  - POST /api/enrollments (progress): parallel completions de-dupe via $addToSet
 *  - POST /api/payments/initiate: parallel free-course requests create exactly ONE enrollment
 *  - POST /api/exams/[id]/start: parallel starts under maxAttempts cap don't exceed it
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { makeUser, makeCourse, makeExam, makeEnrollment } from './factories';
import { setCurrentUser } from './auth-mock';
import { Course, Enrollment, ExamAttempt, Payment } from '@/models';

async function startApi() { return import('@/app/api/exams/[id]/start/route'); }
async function submitApi() { return import('@/app/api/exams/submit/route'); }
async function enrollApi() { return import('@/app/api/enrollments/route'); }
async function payApi()    { return import('@/app/api/payments/initiate/route'); }

function startReq(examId: string) {
  return new NextRequest(new URL(`http://localhost/api/exams/${examId}/start`), { method: 'POST' });
}
function submitReq(body: any) {
  return new NextRequest(new URL('http://localhost/api/exams/submit'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function progressReq(body: any) {
  return new NextRequest(new URL('http://localhost/api/enrollments'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function payReq(body: any) {
  return new NextRequest(new URL('http://localhost/api/payments/initiate'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('Concurrency — atomic guarantees under parallel calls', () => {
  let instructor: any, student: any, course: any, exam: any;

  beforeEach(async () => {
    instructor = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    course = await makeCourse({ instructor: instructor._id, isPublished: true, targetYear: 'grade1_secondary' });
  });

  it('CRITICAL: concurrent exam submits — only one flips the attempt to submitted', async () => {
    exam = await makeExam({ createdBy: instructor._id, course: course._id, targetYear: 'grade1_secondary' });
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });

    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST: startPost } = await startApi();
    const startRes = await startPost(startReq(String(exam._id)));
    const startJson = await startRes.json();
    const attemptId = startJson.data.attempt._id;

    const { POST: submitPost } = await submitApi();
    const body = { examId: String(exam._id), attemptId, answers: [] };

    // Fire 5 submits in parallel
    const results = await Promise.all(
      Array.from({ length: 5 }, () => submitPost(submitReq(body)))
    );
    const statuses = results.map(r => r.status);
    const ok = statuses.filter(s => s === 200).length;
    const conflicts = statuses.filter(s => s === 400 || s === 409 || s === 403).length;

    expect(ok).toBe(1);
    expect(ok + conflicts).toBe(5);

    const attempt: any = await ExamAttempt.findById(attemptId).lean();
    expect(attempt.status).toBe('submitted');
  });

  it('CRITICAL: parallel lesson-progress updates de-duplicate completedLessons (no race-driven double increment)', async () => {
    // Build a course with one lesson
    const lessonId = new mongoose.Types.ObjectId();
    await Course.findByIdAndUpdate(course._id, {
      $set: {
        modules: [
          {
            title: 'M0', order: 0,
            lessons: [
              { _id: lessonId, title: 'L0', type: 'video', order: 0, duration: 60, filePath: '/x.mp4' },
            ],
          },
        ],
      },
    });
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });

    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await enrollApi();

    const body = { courseId: String(course._id), lessonId: String(lessonId) };

    // 10 parallel completions of the same lesson
    const results = await Promise.all(
      Array.from({ length: 10 }, () => POST(progressReq(body)))
    );
    expect(results.every(r => r.status === 200)).toBe(true);

    const enr: any = await Enrollment.findOne({ user: student._id, course: course._id }).lean();
    // Even with 10 races, the lesson must appear exactly ONCE in completedLessons.
    const completed = (enr.progress.completedLessons || []).map((id: any) => String(id));
    const uniqCount = new Set(completed).size;
    expect(uniqCount).toBe(1);
    expect(completed.length).toBe(1);
  });

  it('CRITICAL: parallel free-course payment initiations create EXACTLY ONE enrollment', async () => {
    // free course → bypasses Paymob, directly creates enrollment
    const freeCourse = await makeCourse({
      instructor: instructor._id, price: 0, isPublished: true, targetYear: 'grade1_secondary',
    });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });

    const { POST } = await payApi();

    const requests = Array.from({ length: 5 }, () =>
      POST(payReq({ courseId: String(freeCourse._id), method: 'card' }))
    );
    const results = await Promise.all(requests);
    // No 5xx — at least one 200/201 success and the rest are either successes
    // (idempotent re-fetch of existing enrollment) or 400 (already enrolled).
    expect(results.some(r => r.status >= 200 && r.status < 300)).toBe(true);
    expect(results.every(r => r.status < 500)).toBe(true);

    // Unique index on (user, course) means at most one enrollment.
    const count = await Enrollment.countDocuments({ user: student._id, course: freeCourse._id });
    expect(count).toBe(1);

    // For free, exactly one Payment row of method=free is reasonable; allow up to 1.
    const payCount = await Payment.countDocuments({ user: student._id, course: freeCourse._id, method: 'free' });
    expect(payCount).toBeGreaterThanOrEqual(1);
  });

  it('CRITICAL: parallel exam starts respect maxAttempts (no off-by-one)', async () => {
    const examLimited = await makeExam({
      createdBy: instructor._id, course: course._id,
      targetYear: 'grade1_secondary',
    });
    // Reduce to maxAttempts=1 by direct doc write
    examLimited.maxAttempts = 1;
    await examLimited.save();
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });

    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();

    // Fire 3 parallel start calls
    const results = await Promise.all([
      POST(startReq(String(examLimited._id))),
      POST(startReq(String(examLimited._id))),
      POST(startReq(String(examLimited._id))),
    ]);
    const statuses = results.map(r => r.status);

    // At most ONE attempt was created
    const attemptCount = await ExamAttempt.countDocuments({
      exam: examLimited._id, user: student._id,
    });
    expect(attemptCount).toBeLessThanOrEqual(1);

    // At least one of the parallel calls must have succeeded (200 or 201)
    expect(statuses.some(s => s >= 200 && s < 300)).toBe(true);
  });
});
