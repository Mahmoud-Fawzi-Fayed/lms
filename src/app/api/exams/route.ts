import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess, getAuthUser } from '@/lib/api-helpers';
import { Exam, ExamAttempt, Course, ExamEnrollment } from '@/models';
import { examSchema } from '@/lib/validations';
import connectDB from '@/lib/db';

// GET /api/exams - List exams (or user's attempts if myAttempts=true)
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId');
    const myAttempts = searchParams.get('myAttempts');
    const user = await getAuthUser(req);

    // Return user's exam attempts
    if (myAttempts === 'true') {
      if (!user) return apiError('يجب تسجيل الدخول', 401);

      const attempts = await ExamAttempt.find({
        user: user.id,
        status: { $in: ['submitted', 'timed-out'] },
      })
        .populate('exam', 'title')
        .populate('course', 'title')
        .sort({ submittedAt: -1 })
        .lean();

      return apiSuccess({ attempts });
    }

    let filter: any = { isPublished: true };
    if (courseId) filter.course = courseId;

    // Students see only exams assigned to their academic year
    if (user?.role === 'student') {
      if (!user.academicYear) {
        filter._id = null;
      } else {
        filter.targetYear = user.academicYear;
      }
    }

    // Instructors see all their own exams (including drafts) when listing without courseId filter
    if (!courseId) {
      if (user?.role === 'instructor') {
        const myCourses = await Course.find({ instructor: user.id }).select('_id').lean();
        const myCourseIds = (myCourses as any[]).map((c) => c._id);
        filter = {
          $or: [
            { isPublished: true },
            { course: { $in: myCourseIds } },
            { createdBy: user.id },
          ],
        };
      }
    }

    const exams = await Exam.find(filter)
      .populate('course', 'title slug')
      .select('-questions.options.isCorrect -questions.correctAnswer -questions.explanation')
      .sort({ createdAt: -1 })
      .lean();

    if (user?.role === 'student' && exams.length > 0) {
      const standalonePaidIds = (exams as any[])
        .filter((e) => !e.course && (e.accessType === 'paid' || (e.price ?? 0) > 0))
        .map((e) => e._id);

      let enrolledSet = new Set<string>();
      if (standalonePaidIds.length > 0) {
        const enrollments = await ExamEnrollment.find({
          user: user.id,
          exam: { $in: standalonePaidIds },
          status: 'active',
        })
          .select('exam')
          .lean();
        enrolledSet = new Set(enrollments.map((e: any) => String(e.exam)));
      }

      const examsWithAccess = (exams as any[]).map((exam) => {
        const finalPrice = exam.accessType === 'free' ? 0 : (exam.discountPrice ?? exam.price ?? 0);
        const isCourseExam = !!exam.course;
        const isFree = finalPrice === 0;
        const canAccess = isCourseExam || isFree || enrolledSet.has(String(exam._id));
        return {
          ...exam,
          finalPrice,
          canAccess,
        };
      });

      return apiSuccess({ exams: examsWithAccess });
    }

    return apiSuccess({ exams });
  } catch (error: any) {
    return apiError(error.message, 500);
  }
}

// POST /api/exams - Create exam (instructor/admin)
export const POST = withAuth(async (req, user) => {
  const body = await req.json();
  const parsed = examSchema.safeParse(body);

  if (!parsed.success) {
    return apiError('بيانات الاختبار غير صحيحة');
  }

  if (parsed.data.course) {
    const course = await Course.findById(parsed.data.course).select('instructor');
    if (!course) return apiError('الكورس غير موجود', 404);
    if (user.role !== 'admin' && course.instructor.toString() !== user.id) {
      return apiError('غير مصرح لك بهذا الكورس', 403);
    }
  }

  const isFreeExam = !!parsed.data.course || parsed.data.accessType === 'free';
  const normalizedPrice = isFreeExam ? 0 : Math.max(0, Number(parsed.data.price) || 0);
  const normalizedDiscount =
    isFreeExam
      ? undefined
      : (parsed.data.discountPrice != null && Number(parsed.data.discountPrice) > 0 && Number(parsed.data.discountPrice) < normalizedPrice
        ? Number(parsed.data.discountPrice)
        : undefined);
  const effectivePrice = normalizedDiscount ?? normalizedPrice;

  if (!parsed.data.course && !isFreeExam) {
    const finalPrice = effectivePrice;
    if (!finalPrice || finalPrice <= 0) {
      return apiError('الاختبار المدفوع يجب أن يحتوي على سعر أكبر من صفر');
    }
  }

  // Validate questions based on type
  for (const q of parsed.data.questions) {
    if (q.type === 'mcq' || q.type === 'single') {
      if (!q.options || q.options.length < 2) {
        return apiError('أسئلة الاختيار من متعدد تحتاج خيارين على الأقل');
      }
      const hasCorrect = q.options.some(o => o.isCorrect);
      if (!hasCorrect) {
        return apiError(`السؤال "${q.text}" لا يحتوي إجابة صحيحة`);
      }
    }
    if (q.type === 'truefalse') {
      if (!q.options || q.options.length !== 2) {
        return apiError('أسئلة صح/خطأ يجب أن تحتوي خيارين فقط');
      }
    }
    if (q.type === 'fillinblank' && !q.correctAnswer) {
      return apiError(`سؤال أكمل الفراغ "${q.text}" يحتاج إجابة صحيحة`);
    }
  }

  const exam = await Exam.create({
    ...parsed.data,
    accessType: isFreeExam ? 'free' : 'paid',
    price: normalizedPrice,
    discountPrice: normalizedDiscount,
    course: parsed.data.course || undefined,
    createdBy: user.id,
  });
  return apiSuccess(exam, 201);
}, ['instructor', 'admin']);
