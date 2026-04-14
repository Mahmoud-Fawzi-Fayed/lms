import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { Exam, ExamAttempt, Enrollment, ExamEnrollment } from '@/models';
import { isSameAcademicYear } from '@/lib/academic-year';

// POST /api/exams/[id]/start - Start an exam attempt
export const POST = withAuth(async (req, user) => {
  const examId = req.nextUrl.pathname.split('/')[3];

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
        attempt: inProgress,
        exam: sanitizeExamForAttempt(exam),
        timedOut: true,
      });
    }
    // Return existing in-progress attempt
    return apiSuccess({ attempt: inProgress, exam: sanitizeExamForAttempt(exam) });
  }

  // Create new attempt
  const attempt = await ExamAttempt.create({
    user: user.id,
    exam: examId,
    course: exam.course,
    attemptNumber: previousAttempts + 1,
    startedAt: new Date(),
    status: 'in-progress',
    answers: [],
  });

  return apiSuccess({
    attempt,
    exam: sanitizeExamForAttempt(exam),
  });
}, ['student', 'instructor', 'admin']);

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
