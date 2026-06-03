/**
 * Integration tests — exam lifecycle (start + submit) + listing/details.
 *
 * Pentest/QA focus:
 *  - Authentication / authorization / live-status gates
 *  - Academic-year scoping (course-linked + standalone)
 *  - Course-linked exams require active enrollment (unless isPreview)
 *  - Standalone paid exams require ExamEnrollment
 *  - maxAttempts enforcement with pre-existing submitted+timed-out attempts
 *  - In-progress resume vs timed-out grace path
 *  - Snapshot is NEVER returned to client (questionSnapshot leak protection)
 *  - Correct answers / isCorrect stripped from payload to non-owners
 *  - IDOR — submitting another user's attempt
 *  - Cross-exam attempt id (attempt belongs to a different exam)
 *  - Atomic double-submit (concurrent submits — only one wins)
 *  - Grading correctness across mcq/single/truefalse/fillinblank
 *  - Score/passed/timed-out flags
 *  - showResults gating (no leaked correct answers when disabled)
 *  - Invalid ObjectId / malformed payload
 *  - Rate-limit on exam start
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { makeUser, makeCourse, makeEnrollment, makePayment, makeExam } from './factories';
import { setCurrentUser, clearCurrentUser, mockRequest } from './auth-mock';
import { Exam, ExamAttempt, ExamEnrollment } from '@/models';

async function startApi() {
  return import('@/app/api/exams/[id]/start/route');
}
async function submitApi() {
  return import('@/app/api/exams/submit/route');
}
async function listApi() {
  return import('@/app/api/exams/route');
}
async function detailApi() {
  return import('@/app/api/exams/[id]/route');
}

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

/** Build a richer exam directly so we control question shapes. */
async function makeRichExam(opts: {
  createdBy: mongoose.Types.ObjectId | string;
  course?: mongoose.Types.ObjectId | string;
  targetYear?: string;
  passingScore?: number;
  duration?: number;
  maxAttempts?: number;
  isPreview?: boolean;
  accessType?: 'free' | 'paid';
  price?: number;
  showResults?: boolean;
}) {
  return Exam.create({
    title: 'Rich Exam',
    createdBy: opts.createdBy,
    course: opts.course,
    targetYear: opts.targetYear ?? 'grade1_secondary',
    accessType: opts.accessType ?? 'free',
    price: opts.price ?? 0,
    duration: opts.duration ?? 30,
    passingScore: opts.passingScore ?? 60,
    maxAttempts: opts.maxAttempts ?? 3,
    isPublished: true,
    isPreview: opts.isPreview ?? false,
    showResults: opts.showResults ?? true,
    questions: [
      {
        type: 'mcq',
        text: 'mcq?',
        options: [
          { text: 'WRONG', isCorrect: false },
          { text: 'RIGHT', isCorrect: true },
        ],
        points: 2,
        order: 0,
      },
      {
        type: 'truefalse',
        text: 'tf?',
        options: [
          { text: 'true', isCorrect: true },
          { text: 'false', isCorrect: false },
        ],
        points: 1,
        order: 1,
      },
      {
        type: 'fillinblank',
        text: 'fill?',
        correctAnswer: 'Cairo',
        points: 3,
        order: 2,
      },
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/exams/[id]/start — auth, gating, attempts', () => {
  let inst: any, student: any, otherStudent: any;
  let course: any, exam: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    otherStudent = await makeUser({ role: 'student', academicYear: 'grade2_secondary' });
    course = await makeCourse({
      instructor: inst._id, isPublished: true, targetYear: 'grade1_secondary',
    });
    exam = await makeRichExam({ createdBy: inst._id, course: course._id, targetYear: 'grade1_secondary' });
  });

  it('rejects unauthenticated request with 401', async () => {
    clearCurrentUser();
    const { POST } = await startApi();
    const res = await POST(startReq(String(exam._id)));
    expect(res.status).toBe(401);
  });

  it('rejects malformed exam id with 400', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();
    const res = await POST(startReq('not-an-id'));
    expect(res.status).toBe(400);
  });

  it('rejects unpublished exam with 404', async () => {
    await Exam.findByIdAndUpdate(exam._id, { isPublished: false });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    const { POST } = await startApi();
    const res = await POST(startReq(String(exam._id)));
    expect(res.status).toBe(404);
  });

  it('rejects student whose academic year does not match', async () => {
    setCurrentUser({ id: String(otherStudent._id), role: 'student', academicYear: 'grade2_secondary' });
    const { POST } = await startApi();
    const res = await POST(startReq(String(exam._id)));
    expect(res.status).toBe(403);
  });

  it('course-linked exam requires active enrollment (non-preview)', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();
    const res = await POST(startReq(String(exam._id)));
    expect(res.status).toBe(403);
  });

  it('isPreview course-linked exam can be started without enrollment', async () => {
    const previewExam = await makeRichExam({
      createdBy: inst._id, course: course._id, targetYear: 'grade1_secondary', isPreview: true,
    });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();
    const res = await POST(startReq(String(previewExam._id)));
    expect(res.status).toBe(200);
  });

  it('standalone paid exam requires ExamEnrollment', async () => {
    const paidExam = await makeRichExam({
      createdBy: inst._id, accessType: 'paid', price: 99, targetYear: 'grade1_secondary',
    });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();
    const res = await POST(startReq(String(paidExam._id)));
    expect(res.status).toBe(403);
  });

  it('standalone paid exam allowed when ExamEnrollment is active', async () => {
    const paidExam = await makeRichExam({
      createdBy: inst._id, accessType: 'paid', price: 99, targetYear: 'grade1_secondary',
    });
    await ExamEnrollment.create({ user: student._id, exam: paidExam._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();
    const res = await POST(startReq(String(paidExam._id)));
    expect(res.status).toBe(200);
  });

  it('standalone free exam allowed without enrollment', async () => {
    const freeExam = await makeRichExam({
      createdBy: inst._id, accessType: 'free', targetYear: 'grade1_secondary',
    });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();
    const res = await POST(startReq(String(freeExam._id)));
    expect(res.status).toBe(200);
  });

  it('blocks 4th start once 3 attempts (submitted/timed-out) exist', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    for (let i = 1; i <= 3; i++) {
      await ExamAttempt.create({
        user: student._id, exam: exam._id, attemptNumber: i,
        status: i === 2 ? 'timed-out' : 'submitted',
        score: 50, totalPoints: 6, earnedPoints: 3, passed: false,
        startedAt: new Date(), submittedAt: new Date(),
      });
    }
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();
    const res = await POST(startReq(String(exam._id)));
    expect(res.status).toBe(400);
  });

  it('returns existing in-progress attempt instead of creating a new one', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    const inProgress = await ExamAttempt.create({
      user: student._id, exam: exam._id, attemptNumber: 1,
      status: 'in-progress', startedAt: new Date(),
      totalPoints: 6, earnedPoints: 0, score: 0, passed: false,
    });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();
    const res = await POST(startReq(String(exam._id)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.attempt._id).toBe(String(inProgress._id));
    const count = await ExamAttempt.countDocuments({ user: student._id, exam: exam._id });
    expect(count).toBe(1);
  });

  it('returns timedOut=true when in-progress attempt has exceeded duration', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    // Started 2 hours ago — duration is only 30 min.
    await ExamAttempt.create({
      user: student._id, exam: exam._id, attemptNumber: 1,
      status: 'in-progress', startedAt: new Date(Date.now() - 2 * 60 * 60_000),
      totalPoints: 6, earnedPoints: 0, score: 0, passed: false,
    });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();
    const res = await POST(startReq(String(exam._id)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.timedOut).toBe(true);
  });

  it('NEVER returns questionSnapshot (or correct answers) in start response', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();
    const res = await POST(startReq(String(exam._id)));
    expect(res.status).toBe(200);
    const json = await res.json();
    const blob = JSON.stringify(json);
    expect(json.data.attempt.questionSnapshot).toBeUndefined();
    // Sanitized exam questions must not include isCorrect / correctAnswer.
    expect(blob).not.toContain('isCorrect');
    expect(blob).not.toContain('correctAnswer');
    // RIGHT/WRONG option labels are still present (text is fine), but the answer key isn't.
    expect(json.data.exam.questions.length).toBe(3);
    for (const q of json.data.exam.questions) {
      expect(q.correctAnswer).toBeUndefined();
      if (q.options) {
        for (const o of q.options) expect(o.isCorrect).toBeUndefined();
      }
    }
  });

  it('rate-limits >6 starts/min for the same user+exam', async () => {
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const res = await POST(startReq(String(exam._id)));
      if (res.status === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/exams/submit — grading, IDOR, atomic double-submit', () => {
  let inst: any, student: any, otherStudent: any;
  let course: any, exam: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    student = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    otherStudent = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    course = await makeCourse({ instructor: inst._id, isPublished: true, targetYear: 'grade1_secondary' });
    exam = await makeRichExam({ createdBy: inst._id, course: course._id, targetYear: 'grade1_secondary' });
    await makeEnrollment({ user: student._id, course: course._id, status: 'active' });
  });

  async function startAttempt(asUser = student) {
    setCurrentUser({ id: String(asUser._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await startApi();
    const res = await POST(startReq(String(exam._id)));
    const json = await res.json();
    return json.data;
  }

  it('rejects malformed body / invalid ObjectIds with 400', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await submitApi();
    const res = await POST(submitReq({ examId: 'bad', attemptId: 'bad', answers: [] }));
    expect(res.status).toBe(400);
  });

  it('rejects garbage JSON body with 400', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await submitApi();
    const req = new NextRequest(new URL('http://localhost/api/exams/submit'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects another user trying to submit my attempt (IDOR)', async () => {
    const { attempt } = await startAttempt(student);
    // Switch to a different student
    setCurrentUser({ id: String(otherStudent._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await submitApi();
    const res = await POST(submitReq({ examId: String(exam._id), attemptId: attempt._id, answers: [] }));
    expect(res.status).toBe(403);
  });

  it('rejects mismatched examId / attemptId pair', async () => {
    const { attempt } = await startAttempt(student);
    const otherExam = await makeRichExam({ createdBy: inst._id, course: course._id, targetYear: 'grade1_secondary' });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await submitApi();
    const res = await POST(submitReq({ examId: String(otherExam._id), attemptId: attempt._id, answers: [] }));
    expect(res.status).toBe(400);
  });

  it('rejects 404 for unknown attemptId', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await submitApi();
    const res = await POST(submitReq({
      examId: String(exam._id),
      attemptId: new mongoose.Types.ObjectId().toString(),
      answers: [],
    }));
    expect(res.status).toBe(404);
  });

  it('grades all 3 question types correctly when all answers are right', async () => {
    const { attempt, exam: examDto } = await startAttempt(student);
    const qByText: Record<string, any> = Object.fromEntries(examDto.questions.map((q: any) => [q.text, q]));
    const mcq = qByText['mcq?']; const tf = qByText['tf?']; const fb = qByText['fill?'];
    const rightOpt = mcq.options.find((o: any) => o.text === 'RIGHT')!;
    const trueOpt  = tf.options.find((o: any) => o.text === 'true')!;

    const { POST } = await submitApi();
    const res = await POST(submitReq({
      examId: String(exam._id),
      attemptId: attempt._id,
      answers: [
        { questionId: String(mcq._id), selectedOption: String(rightOpt._id) },
        { questionId: String(tf._id),  selectedOption: String(trueOpt._id) },
        { questionId: String(fb._id),  answer: 'cairo' }, // case-insensitive grading
      ],
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.score).toBe(100);
    expect(json.data.passed).toBe(true);
    expect(json.data.earnedPoints).toBe(6);
    expect(json.data.totalPoints).toBe(6);
    expect(json.data.status).toBe('submitted');
  });

  it('partial credit — only mcq correct → score 33', async () => {
    const { attempt, exam: examDto } = await startAttempt(student);
    const qByText: Record<string, any> = Object.fromEntries(examDto.questions.map((q: any) => [q.text, q]));
    const mcq = qByText['mcq?']; const tf = qByText['tf?']; const fb = qByText['fill?'];
    const rightOpt = mcq.options.find((o: any) => o.text === 'RIGHT')!;
    const falseOpt = tf.options.find((o: any) => o.text === 'false')!;

    const { POST } = await submitApi();
    const res = await POST(submitReq({
      examId: String(exam._id),
      attemptId: attempt._id,
      answers: [
        { questionId: String(mcq._id), selectedOption: String(rightOpt._id) }, // 2pt OK
        { questionId: String(tf._id),  selectedOption: String(falseOpt._id) },  // 0
        { questionId: String(fb._id),  answer: 'Alexandria' },                  // 0
      ],
    }));
    const json = await res.json();
    expect(json.data.earnedPoints).toBe(2);
    expect(json.data.totalPoints).toBe(6);
    expect(json.data.score).toBe(33); // 2/6 → 33
    expect(json.data.passed).toBe(false);
  });

  it('marks attempt as timed-out when submitted past duration + 1 min grace', async () => {
    const { attempt } = await startAttempt(student);
    // Backdate startedAt to 2 hours ago (duration is 30 min).
    await ExamAttempt.updateOne(
      { _id: attempt._id },
      { $set: { startedAt: new Date(Date.now() - 2 * 60 * 60_000) } },
    );
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await submitApi();
    const res = await POST(submitReq({
      examId: String(exam._id),
      attemptId: attempt._id,
      answers: [],
    }));
    const json = await res.json();
    expect(json.data.status).toBe('timed-out');
  });

  it('atomic double-submit: only one wins, second returns 409', async () => {
    const { attempt } = await startAttempt(student);
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await submitApi();
    const body = { examId: String(exam._id), attemptId: attempt._id, answers: [] };
    const [r1, r2] = await Promise.all([POST(submitReq(body)), POST(submitReq(body))]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('grades against questionSnapshot — instructor edits AFTER start do not change result', async () => {
    const { attempt, exam: examDto } = await startAttempt(student);
    const qByText: Record<string, any> = Object.fromEntries(examDto.questions.map((q: any) => [q.text, q]));
    const mcq = qByText['mcq?'];
    const rightOptId = String(mcq.options.find((o: any) => o.text === 'RIGHT')!._id);

    // Instructor flips the correct answer AFTER the student saw the questions.
    await Exam.updateOne(
      { _id: exam._id, 'questions.text': 'mcq?' },
      {
        $set: {
          'questions.$.options': [
            { text: 'WRONG', isCorrect: true },
            { text: 'RIGHT', isCorrect: false },
          ],
        },
      },
    );

    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { POST } = await submitApi();
    const res = await POST(submitReq({
      examId: String(exam._id),
      attemptId: attempt._id,
      answers: [{ questionId: String(mcq._id), selectedOption: rightOptId }],
    }));
    const json = await res.json();
    // Snapshot still says RIGHT is correct.
    expect(json.data.earnedPoints).toBeGreaterThan(0);
  });

  // REGRESSION (Bug-fix B): the questionSnapshot used to omit `explanation`, so
  // result.details[i].explanation was always undefined for the student.
  it('REGRESSION: submit response includes question.explanation when showResults=true', async () => {
    // Build an exam whose questions have explanations, then start + submit.
    const explExam = await Exam.create({
      title: 'with-explanation',
      createdBy: inst._id, course: course._id, targetYear: 'grade1_secondary',
      accessType: 'free', price: 0, duration: 30, passingScore: 60, maxAttempts: 3,
      isPublished: true, showResults: true,
      questions: [{
        type: 'mcq', text: 'q?',
        options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }],
        points: 1, order: 0,
        explanation: 'Because A is the right one.',
      }],
    });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const startRes = await (await startApi()).POST(startReq(String(explExam._id)));
    const startJson = await startRes.json();
    const aId = startJson.data.attempt._id;

    const { POST } = await submitApi();
    const res = await POST(submitReq({ examId: String(explExam._id), attemptId: aId, answers: [] }));
    const json = await res.json();
    expect(json.data.details).toBeTruthy();
    expect(json.data.details[0].explanation).toBe('Because A is the right one.');
  });

  it('does NOT include details (correct answers) when showResults=false', async () => {
    const noResultsExam = await makeRichExam({
      createdBy: inst._id, course: course._id, targetYear: 'grade1_secondary', showResults: false,
    });
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    // Start it
    const start = await (await startApi()).POST(startReq(String(noResultsExam._id)));
    const startJson = await start.json();
    const aId = startJson.data.attempt._id;
    const { POST } = await submitApi();
    const res = await POST(submitReq({ examId: String(noResultsExam._id), attemptId: aId, answers: [] }));
    const json = await res.json();
    expect(json.data.details).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/exams + GET /api/exams/[id] — listing & details', () => {
  let inst: any, otherInst: any, admin: any, student: any;
  let courseSec1: any, examSec1: any, examSec2Year: any, examUnpub: any;

  beforeEach(async () => {
    inst = await makeUser({ role: 'instructor' });
    otherInst = await makeUser({ role: 'instructor' });
    admin = await makeUser({ role: 'admin' });
    student = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    courseSec1 = await makeCourse({ instructor: inst._id, isPublished: true, targetYear: 'grade1_secondary' });
    examSec1 = await makeRichExam({ createdBy: inst._id, course: courseSec1._id, targetYear: 'grade1_secondary' });
    examSec2Year = await makeRichExam({ createdBy: inst._id, targetYear: 'grade2_secondary' });
    examUnpub = await Exam.create({
      title: 'unpub', createdBy: inst._id, course: courseSec1._id, targetYear: 'grade1_secondary',
      duration: 30, passingScore: 60, maxAttempts: 3, isPublished: false,
      questions: [{ type: 'mcq', text: 'q', options: [{text:'a',isCorrect:true},{text:'b',isCorrect:false}], points: 1, order: 0 }],
    });
  });

  it('student only sees published exams matching their academic year', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await listApi();
    const res = await GET(mockRequest('/api/exams'));
    const json = await res.json();
    const ids = json.data.exams.map((e: any) => String(e._id));
    expect(ids).toContain(String(examSec1._id));
    expect(ids).not.toContain(String(examSec2Year._id));
    expect(ids).not.toContain(String(examUnpub._id));
  });

  it('instructor sees own draft exams', async () => {
    setCurrentUser({ id: String(inst._id), role: 'instructor' });
    const { GET } = await listApi();
    const res = await GET(mockRequest('/api/exams'));
    const json = await res.json();
    const ids = json.data.exams.map((e: any) => String(e._id));
    expect(ids).toContain(String(examUnpub._id));
  });

  it('list response strips correct answers and explanation', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await listApi();
    const res = await GET(mockRequest('/api/exams'));
    const blob = JSON.stringify(await res.json());
    expect(blob).not.toContain('correctAnswer');
    expect(blob).not.toContain('isCorrect');
    expect(blob).not.toContain('explanation');
  });

  it('GET /api/exams/[id] hides unpublished exam from non-owner students (404)', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await detailApi();
    const res = await GET(
      new NextRequest(new URL(`http://localhost/api/exams/${examUnpub._id}`)),
      { params: { id: String(examUnpub._id) } } as any,
    );
    expect(res.status).toBe(404);
  });

  it('GET /api/exams/[id] returns full data (with correct answers) to owner', async () => {
    setCurrentUser({ id: String(inst._id), role: 'instructor' });
    const { GET } = await detailApi();
    const res = await GET(
      new NextRequest(new URL(`http://localhost/api/exams/${examUnpub._id}`)),
      { params: { id: String(examUnpub._id) } } as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const blob = JSON.stringify(json);
    expect(blob).toContain('isCorrect');
  });

  it('GET /api/exams/[id] strips correct answers for students', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await detailApi();
    const res = await GET(
      new NextRequest(new URL(`http://localhost/api/exams/${examSec1._id}`)),
      { params: { id: String(examSec1._id) } } as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const blob = JSON.stringify(json);
    expect(blob).not.toContain('isCorrect');
    expect(blob).not.toContain('correctAnswer');
  });

  it('non-owner instructor cannot see another instructor\'s draft', async () => {
    setCurrentUser({ id: String(otherInst._id), role: 'instructor' });
    const { GET } = await detailApi();
    const res = await GET(
      new NextRequest(new URL(`http://localhost/api/exams/${examUnpub._id}`)),
      { params: { id: String(examUnpub._id) } } as any,
    );
    expect(res.status).toBe(404);
  });

  it('admin can see any draft', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await detailApi();
    const res = await GET(
      new NextRequest(new URL(`http://localhost/api/exams/${examUnpub._id}`)),
      { params: { id: String(examUnpub._id) } } as any,
    );
    expect(res.status).toBe(200);
  });

  it('rejects non-ObjectId in detail route with 400', async () => {
    setCurrentUser({ id: String(student._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await detailApi();
    const res = await GET(
      new NextRequest(new URL('http://localhost/api/exams/not-an-id')),
      { params: { id: 'not-an-id' } } as any,
    );
    expect(res.status).toBe(400);
  });
});
