import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess, isValidObjectId } from '@/lib/api-helpers';
import { Enrollment, Course, ExamAttempt } from '@/models';
import { isSameAcademicYear } from '@/lib/academic-year';

// GET /api/enrollments - Get user's enrollments
export const GET = withAuth(async (req, user) => {
  const enrollments = await Enrollment.find({
    user: user.id,
    status: 'active',
  })
    .populate({
      path: 'course',
      select: 'title slug thumbnail instructor category level modules',
      populate: { path: 'instructor', select: 'name' },
    })
    .sort({ enrolledAt: -1 })
    .lean();

  return apiSuccess({ enrollments });
});

// POST /api/enrollments/progress - Update lesson progress
export const POST = withAuth(async (req, user) => {
  let courseId: string, lessonId: string;
  try { ({ courseId, lessonId } = await req.json()); } catch { return apiError('بيانات غير صالحة', 400); }

  if (!courseId || !lessonId) {
    return apiError('معرف الكورس ومعرف الدرس مطلوبان');
  }
  if (!isValidObjectId(courseId) || !isValidObjectId(lessonId)) {
    return apiError('معرفات غير صالحة', 400);
  }

  const course = await Course.findById(courseId).select('targetYear modules').lean();
  if (!course) {
    return apiError('الكورس غير موجود', 404);
  }

  // Verify the lessonId actually belongs to this course — prevents a student from
  // marking arbitrary IDs as completed to inflate progress / earn completion rewards.
  const lessonBelongs = (course.modules || []).some((mod: any) =>
    (mod.lessons || []).some((l: any) => l._id?.toString() === lessonId)
  );
  if (!lessonBelongs) {
    return apiError('الدرس غير موجود في هذا الكورس', 404);
  }

  if (user.role === 'student' && course.targetYear && !isSameAcademicYear(user.academicYear, course.targetYear)) {
    return apiError('هذا الكورس غير متاح لسنتك الدراسية', 403);
  }

  const enrollment = await Enrollment.findOne({
    user: user.id,
    course: courseId,
    status: 'active',
  });

  if (!enrollment) {
    return apiError('أنت غير مشترك في هذا الكورس', 403);
  }

  // Add lesson to completed if not already there
  const lessonObjId = lessonId as any;
  if (!enrollment.progress.completedLessons.some((l: any) => l.toString() === lessonObjId)) {
    enrollment.progress.completedLessons.push(lessonObjId);
  }
  enrollment.progress.lastLesson = lessonObjId;

  // Calculate percentage
  if (course) {
    const totalLessons = course.modules.reduce(
      (sum: number, mod: any) => sum + mod.lessons.length,
      0
    );
    enrollment.progress.percentage = totalLessons > 0
      ? Math.round((enrollment.progress.completedLessons.length / totalLessons) * 100)
      : 0;
  }

  await enrollment.save();
  return apiSuccess({ progress: enrollment.progress });
});
