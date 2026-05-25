import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { Exam, ExamAttempt } from '@/models';
import { submitExamSchema } from '@/lib/validations';
import { gradeAttempt } from '@/lib/exam-grading';

// POST /api/exams/submit - Submit exam answers
export const POST = withAuth(async (req, user) => {
  let body: any;
  try { body = await req.json(); } catch { return apiError('بيانات غير صالحة', 400); }
  const parsed = submitExamSchema.safeParse(body);

  if (!parsed.success) {
    return apiError('بيانات تسليم الاختبار غير صحيحة');
  }

  const { examId, attemptId, answers } = parsed.data;

  if (!mongoose.isValidObjectId(attemptId) || !mongoose.isValidObjectId(examId)) {
    return apiError('معرف غير صالح', 400);
  }

  // Fetch attempt including the (select:false) snapshot
  const attempt = await ExamAttempt.findById(attemptId).select('+questionSnapshot');
  if (!attempt) return apiError('محاولة الاختبار غير موجودة', 404);

  if (attempt.user.toString() !== user.id) {
    return apiError('غير مصرح لك', 403);
  }

  if (attempt.exam.toString() !== examId) {
    return apiError('بيانات محاولة الاختبار غير متطابقة', 400);
  }

  if (attempt.status !== 'in-progress') {
    return apiError('تم تسليم هذه المحاولة بالفعل', 400);
  }

  // Grade against the snapshot taken at attempt start (immune to instructor edits).
  // Fall back to live exam questions only for legacy attempts created before snapshots existed.
  let questions: any[] = (attempt as any).questionSnapshot;
  let exam: any = null;
  if (!questions || questions.length === 0) {
    exam = await Exam.findById(examId);
    if (!exam) return apiError('الاختبار غير موجود', 404);
    questions = exam.questions;
  } else {
    // Still need exam metadata (duration, passingScore, showResults)
    exam = await Exam.findById(examId).select('duration passingScore showResults');
    if (!exam) return apiError('الاختبار غير موجود', 404);
  }

  // Check if timed out
  const elapsed = (Date.now() - attempt.startedAt.getTime()) / 1000 / 60;
  const isTimedOut = elapsed > exam.duration + 1; // 1 minute grace period

  // Grade via the extracted, unit-tested pure function.
  const { totalPoints, earnedPoints, gradedAnswers, score, passed } = gradeAttempt(
    questions as any,
    answers as any,
    exam.passingScore
  );
  const finalStatus = isTimedOut ? 'timed-out' : 'submitted';
  const timeSpent = Math.round(elapsed * 60);

  // ATOMIC state transition: only set the values if status is still 'in-progress'.
  // Prevents double-submission / replay scoring inflation.
  const updated = await ExamAttempt.findOneAndUpdate(
    { _id: attempt._id, status: 'in-progress' },
    {
      $set: {
        answers: gradedAnswers,
        score,
        totalPoints,
        earnedPoints,
        passed,
        submittedAt: new Date(),
        timeSpent,
        status: finalStatus,
      },
    },
    { new: true }
  );

  if (!updated) {
    return apiError('تم تسليم هذه المحاولة بالفعل', 409);
  }

  // Build response
  const result: any = {
    score,
    passed,
    earnedPoints,
    totalPoints,
    timeSpent,
    status: finalStatus,
  };

  // Include correct answers if showResults is enabled
  if (exam.showResults) {
    result.details = gradedAnswers.map((a, i) => ({
      question: questions[i].text,
      isCorrect: a.isCorrect,
      explanation: questions[i].explanation,
      correctAnswer:
        questions[i].type === 'fillinblank'
          ? questions[i].correctAnswer
          : questions[i].options?.find((o: any) => o.isCorrect)?.text,
    }));
  }

  return apiSuccess(result);
}, ['student', 'instructor', 'admin']);

