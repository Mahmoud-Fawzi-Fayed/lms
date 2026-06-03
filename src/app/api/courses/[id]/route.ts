import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess, getAuthUser } from '@/lib/api-helpers';
import { Course, Enrollment } from '@/models';
import connectDB from '@/lib/db';
import { isSameAcademicYear, normalizeAcademicYear } from '@/lib/academic-year';
import fs from 'fs/promises';
import path from 'path';

// GET /api/courses/[id] - Get course details
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();

    const { id } = params;

    // Support both ObjectId and slug.
    // BUG-FIX: `mongoose.Types.ObjectId.isValid` accepts ANY 12-byte string,
    // which means a 12-char ASCII slug ("hello-world!") would be misrouted to
    // an `_id` lookup and may match unintended documents. Use a strict 24-hex
    // check so only real ObjectIds use the `_id` filter.
    const isHexObjectId = typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
    const filter: any = isHexObjectId ? { _id: id } : { slug: id };

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

    const orderedModules = [...(course.modules || [])].sort(
      (a: any, b: any) => Number(a?.order ?? 0) - Number(b?.order ?? 0)
    );
    const firstLessonId = orderedModules
      .flatMap((mod: any) => [...(mod.lessons || [])].sort((a: any, b: any) => Number(a?.order ?? 0) - Number(b?.order ?? 0)))
      .find((lesson: any) => lesson?._id)?._id?.toString();

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
          ...(lesson._id?.toString() === firstLessonId ? { isFreeLesson: true } : {}),
          _id: lesson._id,
          title: lesson.title,
          type: lesson.type,
          duration: lesson.duration,
          order: lesson.order,
          isPreview: Boolean(lesson.isPreview || lesson._id?.toString() === firstLessonId),
          videoControls: lesson.videoControls,
          // Show upload status to course owner/admin
          ...(isOwnerOrAdmin && lesson.fileUrl ? { fileUrl: lesson.fileUrl } : {}),
          // Only show content for preview lessons or enrolled users
          ...(isEnrolled || lesson.isPreview || lesson._id?.toString() === firstLessonId
            ? { content: lesson.type === 'text' ? lesson.content : undefined }
            : {}),
        })),
      })),
    };

    return apiSuccess({ course: sanitizedCourse, isEnrolled, enrollment });
  } catch (error: any) {
    console.error("API error:", error); return apiError("Internal server error", 500);
  }
}

// PUT /api/courses/[id] - Update course
export const PUT = withAuth(async (req, user) => {
  const { id } = { id: req.nextUrl.pathname.split('/').pop()! };
  if (!id || !/^[a-f0-9]{24}$/i.test(id)) return apiError('معرف الكورس غير صالح', 400);
  let body: any;
  try { body = await req.json(); } catch { return apiError('بيانات غير صالحة', 400); }

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
  // Also preserve videoControls — they are managed exclusively by the PATCH lesson-settings endpoint
  //
  // SECURITY: the request body is fully attacker-controlled. NEVER let the caller set
  // `filePath`/`fileUrl` directly — those are written only by the upload route after
  // ownership + mime + size checks. Without this stripping, an instructor could submit
  // a new lesson pointing at another instructor's uploaded file and steal their content.
  // Likewise `videoControls` must only come from the PATCH lesson-settings endpoint
  // (boolean-only sanitization) — otherwise an instructor could persist arbitrary objects.
  if (update.modules) {
    const existing = await Course.findById(id).select('+modules.lessons.filePath').lean() as any;
    const filePathMap = new Map<string, string>();
    const fileUrlMap = new Map<string, any>();
    const videoControlsMap = new Map<string, any>();
    (existing?.modules || []).forEach((mod: any) => {
      (mod.lessons || []).forEach((lesson: any) => {
        if (!lesson._id) return;
        const key = lesson._id.toString();
        if (lesson.filePath) filePathMap.set(key, lesson.filePath);
        if (lesson.fileUrl) fileUrlMap.set(key, lesson.fileUrl);
        if (lesson.videoControls) videoControlsMap.set(key, lesson.videoControls);
      });
    });
    update.modules = update.modules.map((mod: any) => ({
      ...mod,
      lessons: (mod.lessons || []).map((lesson: any) => {
        // Strip server-managed fields from the incoming body, then re-add from existing.
        const { filePath: _fp, fileUrl: _fu, videoControls: _vc, ...safe } = lesson || {};
        const key = lesson?._id ? String(lesson._id) : null;
        return {
          ...safe,
          ...(key && filePathMap.has(key) ? { filePath: filePathMap.get(key) } : {}),
          ...(key && fileUrlMap.has(key) ? { fileUrl: fileUrlMap.get(key) } : {}),
          ...(key && videoControlsMap.has(key) ? { videoControls: videoControlsMap.get(key) } : {}),
        };
      }),
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
  if (!id || !/^[a-f0-9]{24}$/i.test(id)) return apiError('معرف الكورس غير صالح', 400);

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

  // Fetch file paths (select:false fields) before deleting the record
  const courseWithPaths = await Course.findById(id)
    .select('+modules.lessons.filePath')
    .lean();

  await Course.findByIdAndDelete(id);

  // Clean up lesson files stored on disk to prevent unbounded disk growth.
  // We do this after the DB delete so a partial failure doesn't leave the
  // course record dangling (worst case: orphaned files, not a lost course).
  // SECURITY: only unlink paths that resolve inside our uploads/ or public/thumbnails/
  // directories. If a lesson row ever contained a poisoned filePath (e.g. via legacy
  // data or a bypass), we must not delete arbitrary files on disk.
  try {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const thumbsDir = path.resolve(process.cwd(), 'public', 'thumbnails');
    const safeUnlink = async (fp: string) => {
      const resolved = path.resolve(fp);
      const inUploads = resolved === uploadsDir || resolved.startsWith(uploadsDir + path.sep);
      const inThumbs  = resolved === thumbsDir  || resolved.startsWith(thumbsDir  + path.sep);
      if (!inUploads && !inThumbs) {
        console.warn('[course:delete] refusing to unlink path outside managed dirs:', resolved);
        return;
      }
      await fs.unlink(resolved).catch(() => {});
    };

    const filePaths: string[] = [];
    for (const mod of (courseWithPaths as any)?.modules || []) {
      for (const lesson of mod.lessons || []) {
        if (lesson.filePath) filePaths.push(lesson.filePath);
      }
    }
    // Also remove the thumbnail from public/thumbnails if it is a local file
    const thumb = (courseWithPaths as any)?.thumbnail as string | undefined;
    if (thumb?.startsWith('/thumbnails/')) {
      filePaths.push(path.join(process.cwd(), 'public', thumb));
    }
    await Promise.all(filePaths.map(safeUnlink));
  } catch {
    // Non-fatal — log but don't block the success response
    console.warn('[course:delete] failed to clean up some uploaded files for course', id);
  }

  return apiSuccess({ message: 'تم حذف الكورس' });
}, ['instructor', 'admin']);
