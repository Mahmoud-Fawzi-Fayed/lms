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

  // BUG-FIX: use an atomic findOneAndUpdate with $addToSet + $set instead of
  // findOne()+save(). The previous implementation had a TOCTOU race — N parallel
  // completions of the same lesson could VersionError out of save() and double-count
  // the lesson on retry. $addToSet is server-side de-duplicating and the operation
  // is single-statement atomic.
  const lessonObjId = lessonId as any;
  const enrollment = await Enrollment.findOneAndUpdate(
    { user: user.id, course: courseId, status: 'active' },
    {
      $addToSet: { 'progress.completedLessons': lessonObjId },
      $set:      { 'progress.lastLesson': lessonObjId },
    },
    { new: true }
  );

  if (!enrollment) {
    return apiError('أنت غير مشترك في هذا الكورس', 403);
  }

  // Recompute percentage from the just-persisted state and write it atomically.
  // (We do it in a separate update so the math reflects post-$addToSet length.)
  if (course) {
    const totalLessons = course.modules.reduce(
      (sum: number, mod: any) => sum + (mod.lessons?.length || 0),
      0
    );
    const completedCount = enrollment.progress.completedLessons.length;
    const percentage = totalLessons > 0
      ? Math.round((completedCount / totalLessons) * 100)
      : 0;
    if (percentage !== enrollment.progress.percentage) {
      await Enrollment.updateOne(
        { _id: enrollment._id },
        { $set: { 'progress.percentage': percentage } }
      );
      enrollment.progress.percentage = percentage;
    }
  }

  return apiSuccess({ progress: enrollment.progress });
});
