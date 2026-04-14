import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { Exam, ExamAttempt } from '@/models';
import { submitExamSchema } from '@/lib/validations';

// POST /api/exams/submit - Submit exam answers
export const POST = withAuth(async (req, user) => {
  const body = await req.json();
  const parsed = submitExamSchema.safeParse(body);

  if (!parsed.success) {
    return apiError('بيانات تسليم الاختبار غير صحيحة');
  }

  const { examId, attemptId, answers } = parsed.data;

  // Get the attempt
  const attempt = await ExamAttempt.findById(attemptId);
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

  // Get the exam with correct answers
  const exam = await Exam.findById(examId);
  if (!exam) return apiError('الاختبار غير موجود', 404);

  // Check if timed out
  const elapsed = (Date.now() - attempt.startedAt.getTime()) / 1000 / 60;
  const isTimedOut = elapsed > exam.duration + 1; // 1 minute grace period

  // Grade the answers
  let totalPoints = 0;
  let earnedPoints = 0;
  const gradedAnswers: any[] = [];

  for (const question of exam.questions) {
    totalPoints += question.points;
    const userAnswer = answers.find(
      a => a.questionId === question._id.toString()
    );

    let isCorrect = false;

    if (userAnswer) {
      switch (question.type) {
        case 'mcq':
        case 'single':
        case 'truefalse': {
          const selectedOpt = (question.options as any[])?.find(
            (o: any) => o._id?.toString() === userAnswer.selectedOption ||
                 o.text === userAnswer.selectedOption
          );
          isCorrect = selectedOpt?.isCorrect || false;
          break;
        }
        case 'fillinblank': {
          isCorrect =
            userAnswer.answer?.trim().toLowerCase() ===
            question.correctAnswer?.trim().toLowerCase();
          break;
        }
      }
    }

    if (isCorrect) earnedPoints += question.points;

    gradedAnswers.push({
      question: question._id,
      selectedOption: userAnswer?.selectedOption,
      answer: userAnswer?.answer,
      isCorrect,
      points: isCorrect ? question.points : 0,
    });
  }

  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passed = score >= exam.passingScore;

  // Update attempt
  attempt.answers = gradedAnswers;
  attempt.score = score;
  attempt.totalPoints = totalPoints;
  attempt.earnedPoints = earnedPoints;
  attempt.passed = passed;
  attempt.submittedAt = new Date();
  attempt.timeSpent = Math.round(elapsed * 60);
  attempt.status = isTimedOut ? 'timed-out' : 'submitted';
  await attempt.save();

  // Build response
  const result: any = {
    score,
    passed,
    earnedPoints,
    totalPoints,
    timeSpent: attempt.timeSpent,
    status: attempt.status,
  };

  // Include correct answers if showResults is enabled
  if (exam.showResults) {
    result.details = gradedAnswers.map((a, i) => ({
      question: exam.questions[i].text,
      isCorrect: a.isCorrect,
      explanation: exam.questions[i].explanation,
      correctAnswer:
        exam.questions[i].type === 'fillinblank'
          ? exam.questions[i].correctAnswer
          : exam.questions[i].options?.find((o: any) => o.isCorrect)?.text,
    }));
  }

  return apiSuccess(result);
}, ['student', 'instructor', 'admin']);
