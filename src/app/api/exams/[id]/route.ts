import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess, getAuthUser } from '@/lib/api-helpers';
import { Exam, ExamAttempt, Enrollment } from '@/models';
import connectDB from '@/lib/db';
import { isSameAcademicYear, normalizeAcademicYear } from '@/lib/academic-year';

// GET /api/exams/[id] - Get exam details
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();

    const user = await getAuthUser(req);

    const exam = await Exam.findById(params.id)
      .populate('course', 'title slug instructor')
      .lean();

    if (!exam) return apiError('الاختبار غير موجود', 404);

    const course = exam.course as any;
    const isOwner =
      user?.role === 'admin' ||
      (user?.role === 'instructor' && (
        exam.createdBy?.toString?.() === user.id ||
        course?.instructor?.toString() === user.id
      ));

    if (!exam.isPublished && !isOwner) {
      return apiError('الاختبار غير موجود', 404);
    }

    // Students can only access exams assigned to their academic year
    if (user?.role === 'student' && exam.targetYear && !isSameAcademicYear(user.academicYear, exam.targetYear)) {
      return apiError('هذا الاختبار غير متاح لسنتك الدراسية', 403);
    }

    // Return full data (including correct answers) to the exam owner for editing
    if (isOwner) {
      return apiSuccess({ exam, attemptsCount: 0, bestScore: 0, canAttempt: false });
    }

    // Strip correct answers for students
    const sanitized = {
      ...exam,
      questions: exam.questions.map((q: any) => ({
        _id: q._id,
        type: q.type,
        text: q.text,
        options: q.options?.map((o: any) => ({ text: o.text })),
        points: q.points,
        order: q.order,
      })),
    };

    let attemptsCount = 0;
    let bestScore = 0;
    if (user) {
      const attempts = await ExamAttempt.find({
        user: user.id,
        exam: params.id,
        status: { $in: ['submitted', 'timed-out'] },
      }).lean();
      attemptsCount = attempts.length;
      bestScore = attempts.reduce((max, a) => Math.max(max, a.score), 0);
    }

    return apiSuccess({
      exam: sanitized,
      attemptsCount,
      bestScore,
      canAttempt: attemptsCount < exam.maxAttempts,
    });
  } catch (error: any) {
    return apiError(error.message, 500);
  }
}

// PUT /api/exams/[id] - Update exam
export const PUT = withAuth(async (req, user) => {
  const id = req.nextUrl.pathname.split('/').pop()!;
  const body = await req.json();

  const exam = await Exam.findById(id).populate('course');
  if (!exam) return apiError('الاختبار غير موجود', 404);

  const course = exam.course as any;
  const canManage =
    user.role === 'admin' ||
    exam.createdBy?.toString?.() === user.id ||
    (!!course && course.instructor.toString() === user.id);

  if (!canManage) {
    return apiError('غير مصرح لك', 403);
  }

  const allowedFields = [
    'title', 'description', 'duration', 'passingScore', 'maxAttempts',
    'shuffleQuestions', 'shuffleOptions', 'showResults', 'isPublished', 'isPreview', 'questions',
    'course', 'targetYear', 'price', 'discountPrice', 'accessType',
  ];

  const update: any = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) update[field] = body[field];
  }

  if (update.targetYear !== undefined) {
    update.targetYear = update.targetYear ? normalizeAcademicYear(update.targetYear) : undefined;
  }

  const hasLinkedCourse = update.course !== undefined ? !!update.course : !!exam.course;
  const requestedAccessType = (update.accessType ?? exam.accessType) as 'free' | 'paid';
  const mustBeFree = hasLinkedCourse || requestedAccessType === 'free';
  const unset: Record<string, 1> = {};

  if (mustBeFree) {
    update.accessType = 'free';
    update.price = 0;
    delete update.discountPrice;
    unset.discountPrice = 1;
  } else {
    const nextPrice = update.price !== undefined ? Math.max(0, Number(update.price) || 0) : Math.max(0, Number(exam.price) || 0);
    if (nextPrice <= 0) {
      return apiError('الاختبار المدفوع يجب أن يحتوي على سعر أكبر من صفر');
    }

    const rawDiscount = update.discountPrice !== undefined ? update.discountPrice : exam.discountPrice;
    const nextDiscount = Number(rawDiscount) || 0;

    update.accessType = 'paid';
    update.price = nextPrice;
    if (nextDiscount > 0 && nextDiscount < nextPrice) {
      update.discountPrice = nextDiscount;
    } else {
      delete update.discountPrice;
      unset.discountPrice = 1;
    }
  }

  const updated = await Exam.findByIdAndUpdate(
    id,
    {
      $set: update,
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    },
    {
      new: true,
      runValidators: false,
    }
  );

  if (!updated) return apiError('فشل تحديث الاختبار', 500);

  return apiSuccess(updated);
}, ['instructor', 'admin']);

// DELETE /api/exams/[id] - Delete exam
export const DELETE = withAuth(async (req, user) => {
  const id = req.nextUrl.pathname.split('/').pop()!;

  const exam = await Exam.findById(id).populate('course');
  if (!exam) return apiError('الاختبار غير موجود', 404);

  const course = exam.course as any;
  const canManage =
    user.role === 'admin' ||
    exam.createdBy?.toString?.() === user.id ||
    (!!course && course.instructor.toString() === user.id);

  if (!canManage) {
    return apiError('غير مصرح لك', 403);
  }

  await Exam.findByIdAndDelete(id);
  await ExamAttempt.deleteMany({ exam: id });

  return apiSuccess({ message: 'تم حذف الاختبار' });
}, ['instructor', 'admin']);
