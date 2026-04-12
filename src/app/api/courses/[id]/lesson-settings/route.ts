import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { Course } from '@/models';
import connectDB from '@/lib/db';

// PATCH /api/courses/[id]/lesson-settings
// Saves videoControls for a specific lesson using $set (does NOT touch filePath)
export const PATCH = withAuth(async (req: NextRequest, user) => {
  await connectDB();

  const segments = req.nextUrl.pathname.split('/');
  const courseId = segments[segments.indexOf('courses') + 1];

  const body = await req.json();
  const { moduleIndex, lessonIndex, videoControls } = body;

  if (moduleIndex === undefined || lessonIndex === undefined || !videoControls) {
    return apiError('بيانات الوحدة والدرس وإعدادات الفيديو مطلوبة', 400);
  }

  const mi = Number(moduleIndex);
  const li = Number(lessonIndex);

  if (isNaN(mi) || isNaN(li)) {
    return apiError('يجب أن تكون مؤشرات الوحدة والدرس أرقاماً صحيحة', 400);
  }

  // Verify course ownership
  const course = await Course.findById(courseId).select('instructor');
  if (!course) return apiError('الكورس غير موجود', 404);
  if (course.instructor.toString() !== user.id && user.role !== 'admin') {
    return apiError('غير مصرح', 403);
  }

  const allowedControls = ['allowSpeed', 'allowSkip', 'allowFullscreen', 'allowSeek', 'allowVolume', 'forceFocus'];
  const sanitizedControls: Record<string, boolean> = {};
  for (const key of allowedControls) {
    if (typeof videoControls[key] === 'boolean') {
      sanitizedControls[key] = videoControls[key];
    }
  }

  if (Object.keys(sanitizedControls).length === 0) {
    return apiError('لا توجد إعدادات صالحة', 400);
  }

  // Set the entire videoControls subdoc at once — safer than per-key dot-notation
  // (does NOT touch any other lesson field including filePath)
  await Course.findByIdAndUpdate(
    courseId,
    { $set: { [`modules.${mi}.lessons.${li}.videoControls`]: sanitizedControls } },
    { strict: false }
  );

  return apiSuccess({ message: 'تم حفظ الإعدادات بنجاح' });
}, ['instructor', 'admin']);
