import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess, rateLimit, isValidObjectId } from '@/lib/api-helpers';
import { Exam, ExamAttempt, Enrollment, ExamEnrollment } from '@/models';
import { isSameAcademicYear } from '@/lib/academic-year';

// POST /api/exams/[id]/start - Start an exam attempt
export const POST = withAuth(async (req, user) => {
  const examId = req.nextUrl.pathname.split('/')[3];

  if (!isValidObjectId(examId)) {
    return apiError('معرف الاختبار غير صالح', 400);
  }

  // Defense against concurrent-start races that could exceed maxAttempts and
  // create multiple in-progress attempts for the same user/exam.
  if (!rateLimit(`exam-start:${user.id}:${examId}`, 6, 60_000)) {
    return apiError('طلبات بدء كثيرة. انتظر قليلاً ثم حاول مرة أخرى.', 429);
  }

  const exam = await Exam.findById(examId).lean();
  if (!exam || !exam.isPublished) {
    return apiError('الاختبار غير موجود', 404);
  }

  if (user.role === 'student' && exam.targetYear && !isSameAcademicYear(user.academicYear, exam.targetYear)) {
    return apiError('هذا الاختبار غير متاح لسنتك الدراسية', 403);
  }

  // If exam is linked to a course, require enrollment (unless isPreview)
  if (exam.course && !exam.isPreview) {
    const enrollment = await Enrollment.findOne({
      user: user.id,
      course: exam.course,
      status: 'active',
    });

    if (!enrollment) {
      return apiError('يجب التسجيل في هذا الكورس أولاً', 403);
    }
  } else {
    const finalPrice = (exam as any).accessType === 'free'
      ? 0
      : ((exam as any).discountPrice ?? (exam as any).price ?? 0);
    const needsPurchase = finalPrice > 0;

    if (needsPurchase) {
      const standaloneEnrollment = await ExamEnrollment.findOne({
        user: user.id,
        exam: examId,
        status: 'active',
      });

      if (!standaloneEnrollment) {
        return apiError('هذا الاختبار مدفوع. يرجى شراء الاختبار أولاً.', 403);
      }
    }
  }

  // Check max attempts
  const previousAttempts = await ExamAttempt.countDocuments({
    user: user.id,
    exam: examId,
    status: { $in: ['submitted', 'timed-out'] },
  });

  if (previousAttempts >= exam.maxAttempts) {
    return apiError(`تم الوصول إلى الحد الأقصى للمحاولات (${exam.maxAttempts})`, 400);
  }

  // Check for in-progress attempt
  const inProgress = await ExamAttempt.findOne({
    user: user.id,
    exam: examId,
    status: 'in-progress',
  });

  if (inProgress) {
    const elapsed = (Date.now() - inProgress.startedAt.getTime()) / 1000 / 60;
    if (elapsed >= exam.duration) {
      // Time expired — return the still-in-progress attempt so the client
      // can call /api/exams/submit with its saved answers (gets graded there).
      // Do NOT pre-mark as timed-out here; submit route will do that.
      return apiSuccess({
        attempt: stripSnapshot(inProgress),
        exam: sanitizeExamForAttempt(exam),
        timedOut: true,
      });
    }
    // Return existing in-progress attempt
    return apiSuccess({ attempt: stripSnapshot(inProgress), exam: sanitizeExamForAttempt(exam) });
  }

  // Create new attempt — store a snapshot of the questions WITH correct answers
  // so submit grades against the exact questions the student was shown, even if the
  // instructor edits the exam afterward.
  const snapshot = (exam.questions || []).map((q: any) => ({
    _id: q._id,
    type: q.type,
    text: q.text,
    points: q.points,
    order: q.order,
    correctAnswer: q.correctAnswer,
    // BUG-FIX: include `explanation` so the submit response (when showResults=true)
    // can echo it back to the student. Previous snapshot omitted it, leaving
    // result.details[i].explanation always undefined.
    explanation: q.explanation,
    options: Array.isArray(q.options)
      ? q.options.map((o: any) => ({ _id: o._id, text: o.text, isCorrect: !!o.isCorrect }))
      : [],
  }));

  // BUG-FIX (concurrency): wrap create() in try/catch — the unique index on
  // (user, exam, attemptNumber) will throw E11000 if a parallel start already
  // claimed the same attemptNumber. We return 409 so the client retries —
  // which will then either resume the now-existing in-progress attempt or fail
  // the maxAttempts check on its next request.
  let attempt;
  try {
    attempt = await ExamAttempt.create({
      user: user.id,
      exam: examId,
      course: exam.course,
      attemptNumber: previousAttempts + 1,
      startedAt: new Date(),
      status: 'in-progress',
      answers: [],
      questionSnapshot: snapshot,
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      return apiError('محاولة بدء متزامنة، يرجى المحاولة مرة أخرى', 409);
    }
    throw err;
  }

  // SECURITY: never return the questionSnapshot — it contains correctAnswer / isCorrect
  // for every option. Mongoose `select:false` only applies to DB reads; the in-memory
  // doc returned by .create() still has it, so we must explicitly strip it.
  return apiSuccess({
    attempt: stripSnapshot(attempt),
    exam: sanitizeExamForAttempt(exam),
  });
}, ['student', 'instructor', 'admin']);

function stripSnapshot(attempt: any) {
  const obj = typeof attempt?.toObject === 'function' ? attempt.toObject() : { ...attempt };
  delete obj.questionSnapshot;
  return obj;
}

function sanitizeExamForAttempt(exam: any) {
  // Normalize legacy type names (old data used "single" for MCQ)
  const normalizeType = (t: string) => t === 'single' ? 'mcq' : t;

  let questions = exam.questions.map((q: any, i: number) => ({
    _id: q._id,
    type: normalizeType(q.type),
    text: q.text,
    points: q.points,
    order: q.order,
    options: Array.isArray(q.options)
      ? q.options
          .filter((o: any) => o && o.text && o.text.trim() !== '')
          .map((o: any) => ({
            text: o.text,
            _id: o._id,
          }))
      : [],
  }));

  // Shuffle questions if enabled
  if (exam.shuffleQuestions) {
    questions = shuffleArray(questions);
  }

  // Shuffle options if enabled
  if (exam.shuffleOptions) {
    questions = questions.map((q: any) => ({
      ...q,
      options: q.options ? shuffleArray(q.options) : q.options,
    }));
  }

  return {
    _id: exam._id,
    title: exam.title,
    duration: exam.duration,
    questions,
  };
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
