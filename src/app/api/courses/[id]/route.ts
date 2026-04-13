import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess, getAuthUser } from '@/lib/api-helpers';
import { Course, Enrollment } from '@/models';
import connectDB from '@/lib/db';
import mongoose from 'mongoose';
import { isSameAcademicYear, normalizeAcademicYear } from '@/lib/academic-year';

// GET /api/courses/[id] - Get course details
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();

    const { id } = params;

    // Support both ObjectId and slug
    const filter: any = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { slug: id };

    // Allow instructor/admin to view their own unpublished courses
    const user = await getAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'instructor')) {
      filter.isPublished = true;
    }

    const course = await Course.findOne(filter)
      .populate('instructor', 'name avatar')
      .lean();

    if (!course) {
      return apiError('الكورس غير موجود', 404);
    }

    // Students can only access courses assigned to their academic year
    if (user?.role === 'student' && course.targetYear && !isSameAcademicYear(user.academicYear, course.targetYear as any)) {
      return apiError('هذا الكورس غير متاح لسنتك الدراسية', 403);
    }

    // Non-admin instructors can only see their own unpublished courses
    if (!course.isPublished && user?.role === 'instructor' &&
        course.instructor?._id?.toString() !== user.id) {
      return apiError('الكورس غير موجود', 404);
    }

    // Check if user is enrolled
    let isEnrolled = false;
    let enrollment = null;

    if (user) {
      enrollment = await Enrollment.findOne({
        user: user.id,
        course: course._id,
        status: 'active',
      }).lean();
      isEnrolled = !!enrollment;
    }

    // Instructor/admin of this course can see full lesson info (upload status etc.)
    const isOwnerOrAdmin = user && (
      user.role === 'admin' ||
      (user.role === 'instructor' && course.instructor?._id?.toString() === user.id)
    );

    // Strip file paths and full content from non-enrolled users
    const sanitizedCourse = {
      ...course,
      modules: (course.modules || []).map((mod: any) => ({
        ...mod,
        lessons: (mod.lessons || []).map((lesson: any) => ({
          _id: lesson._id,
          title: lesson.title,
          type: lesson.type,
          duration: lesson.duration,
          order: lesson.order,
          isPreview: lesson.isPreview,
          videoControls: lesson.videoControls,
          // Show upload status to course owner/admin
          ...(isOwnerOrAdmin && lesson.fileUrl ? { fileUrl: lesson.fileUrl } : {}),
          // Only show content for preview lessons or enrolled users
          ...(isEnrolled || lesson.isPreview
            ? { content: lesson.type === 'text' ? lesson.content : undefined }
            : {}),
        })),
      })),
    };

    return apiSuccess({ course: sanitizedCourse, isEnrolled, enrollment });
  } catch (error: any) {
    return apiError(error.message, 500);
  }
}

// PUT /api/courses/[id] - Update course
export const PUT = withAuth(async (req, user) => {
  const { id } = { id: req.nextUrl.pathname.split('/').pop()! };
  const body = await req.json();

  const course = await Course.findById(id);
  if (!course) return apiError('الكورس غير موجود', 404);

  // Only course instructor or admin can update
  if (course.instructor.toString() !== user.id && user.role !== 'admin') {
    return apiError('غير مصرح لك', 403);
  }

  // Sanitize update fields
  const allowedFields = [
    'title', 'description', 'shortDescription', 'price', 'discountPrice',
    'category', 'level', 'language', 'tags', 'requirements', 'whatYouLearn',
    'isPublished', 'modules', 'thumbnail', 'targetYear',
  ];

  const update: any = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      update[field] = body[field];
    }
  }

  if (update.targetYear !== undefined) {
    update.targetYear = update.targetYear ? normalizeAcademicYear(update.targetYear) : undefined;
  }

  if (update.category !== undefined) {
    update.category = String(update.category).trim();
    if (!update.category) {
      return apiError('التصنيف مطلوب');
    }
  }

  const nextPrice = update.price !== undefined ? Math.max(0, Number(update.price) || 0) : course.price;
  update.price = nextPrice;

  const unset: Record<string, 1> = {};

  if (nextPrice === 0) {
    delete update.discountPrice;
    unset.discountPrice = 1;
  } else if (update.discountPrice !== undefined) {
    const nextDiscount = Number(update.discountPrice) || 0;
    if (nextDiscount > 0 && nextDiscount < nextPrice) {
      update.discountPrice = nextDiscount;
    } else {
      delete update.discountPrice;
      unset.discountPrice = 1;
    }
  }

  // When updating modules, preserve existing filePaths (they are select:false so frontend never sees them)
  if (update.modules) {
    const existing = await Course.findById(id).select('+modules.lessons.filePath').lean() as any;
    const filePathMap = new Map<string, string>();
    (existing?.modules || []).forEach((mod: any) => {
      (mod.lessons || []).forEach((lesson: any) => {
        if (lesson._id && lesson.filePath) {
          filePathMap.set(lesson._id.toString(), lesson.filePath);
        }
      });
    });
    update.modules = update.modules.map((mod: any) => ({
      ...mod,
      lessons: (mod.lessons || []).map((lesson: any) => ({
        ...lesson,
        ...(lesson._id && filePathMap.has(String(lesson._id))
          ? { filePath: filePathMap.get(String(lesson._id)) }
          : {}),
      })),
    }));
  }

  const updated = await Course.findByIdAndUpdate(
    id,
    {
      $set: update,
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    },
    { new: true }
  );

  return apiSuccess(updated);
}, ['instructor', 'admin']);

// DELETE /api/courses/[id] - Delete course
export const DELETE = withAuth(async (req, user) => {
  const id = req.nextUrl.pathname.split('/').pop()!;

  const course = await Course.findById(id);
  if (!course) return apiError('الكورس غير موجود', 404);

  if (course.instructor.toString() !== user.id && user.role !== 'admin') {
    return apiError('غير مصرح لك', 403);
  }

  // Check for active enrollments
  const activeEnrollments = await Enrollment.countDocuments({
    course: id,
    status: 'active',
  });

  if (activeEnrollments > 0) {
    return apiError('لا يمكن حذف كورس يحتوي على طلاب مشتركين. قم بإلغاء النشر بدلاً من ذلك.', 400);
  }

  await Course.findByIdAndDelete(id);
  return apiSuccess({ message: 'تم حذف الكورس' });
}, ['instructor', 'admin']);
