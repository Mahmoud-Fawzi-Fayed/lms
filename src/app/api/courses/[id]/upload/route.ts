import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { Course } from '@/models';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';

// Allow up to 5 minutes for large video uploads
export const maxDuration = 300;

// POST /api/courses/[id]/upload - Upload course content (video/pdf)
export const POST = withAuth(async (req, user) => {
  // Extract courseId from URL: /api/courses/[id]/upload
  const segments = req.nextUrl.pathname.split('/');
  const courseId = segments[segments.indexOf('courses') + 1];

  if (!courseId) return apiError('معرف الكورس مفقود', 400);

  const course = await Course.findById(courseId);
  if (!course) return apiError('الكورس غير موجود', 404);

  if (course.instructor.toString() !== user.id && user.role !== 'admin') {
    return apiError('غير مصرح لك', 403);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e: any) {
    console.error('[upload] formData parse error:', e?.message);
    return apiError('فشل قراءة بيانات النموذج', 400);
  }

  const file = formData.get('file') as File;
  const moduleIndex = parseInt(formData.get('moduleIndex') as string);
  const lessonIndex = parseInt(formData.get('lessonIndex') as string);
  const lessonType = formData.get('type') as string;

  console.log('[upload] courseId:', courseId, '| module:', moduleIndex, 'lesson:', lessonIndex, '| type:', lessonType, '| file:', file?.name, '| size:', file?.size);

  if (!file) return apiError('لم يتم اختيار ملف', 400);
  if (isNaN(moduleIndex) || isNaN(lessonIndex)) return apiError('فهرس الوحدة أو الدرس غير صحيح', 400);

  // Validate file type
  const allowedTypes: Record<string, string[]> = {
    video: ['video/mp4', 'video/webm', 'video/ogg'],
    pdf: ['application/pdf'],
  };

  const allowed = allowedTypes[lessonType];
  if (!allowed) return apiError('نوع الدرس غير صالح', 400);
  if (!allowed.includes(file.type)) {
    return apiError(`نوع الملف غير مدعوم. الأنواع المدعومة: ${allowed.join(', ')}`, 400);
  }

  // File size limits: 500MB for video, 50MB for PDF
  const maxSize = lessonType === 'video' ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return apiError(`حجم الملف كبير. الحد الأقصى: ${maxSize / (1024 * 1024)}MB`, 400);
  }

  // Validate indices exist
  if (!course.modules[moduleIndex] || !course.modules[moduleIndex].lessons[lessonIndex]) {
    return apiError('الوحدة أو الدرس غير موجود', 404);
  }

  // Generate secure filename
  const ext = path.extname(file.name || '');
  const secureFilename = `${courseId}_${crypto.randomUUID()}${ext}`;
  const uploadDir = path.join(process.cwd(), 'uploads', lessonType + 's');

  try {
    await fs.mkdir(uploadDir, { recursive: true });
  } catch (e: any) {
    console.error('[upload] mkdir error:', e?.message);
    return apiError('فشل إنشاء مجلد الرفع', 500);
  }

  const filePath = path.join(uploadDir, secureFilename);
  try {
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    await fs.writeFile(filePath, buffer);
  } catch (e: any) {
    console.error('[upload] write error:', e?.message);
    return apiError('فشل كتابة الملف: ' + e?.message, 500);
  }

  // Update lesson using $set with direct path — avoids markModified issues
  // filePath has select:false so direct $set is safer than load+save
  try {
    await Course.findByIdAndUpdate(courseId, {
      $set: {
        [`modules.${moduleIndex}.lessons.${lessonIndex}.filePath`]: filePath,
        [`modules.${moduleIndex}.lessons.${lessonIndex}.fileUrl`]: 'uploaded',
      },
    });
  } catch (e: any) {
    console.error('[upload] save error:', e?.message);
    // Clean up uploaded file on DB save failure
    await fs.unlink(filePath).catch(() => {});
    return apiError('فشل حفظ بيانات الكورس: ' + e?.message, 500);
  }

  return apiSuccess({ message: 'تم رفع الملف بنجاح' });
}, ['instructor', 'admin']);
