import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { Course } from '@/models';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

// Allow large uploads and ensure Node runtime for filesystem streaming
export const runtime = 'nodejs';
export const maxDuration = 1800;

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
  const lessonType = formData.get('type') as string;

  if (!file) return apiError('لم يتم اختيار ملف', 400);

  // --- Thumbnail upload ---
  if (lessonType === 'thumbnail') {
    const allowedImages = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedImages.includes(file.type)) {
      return apiError('نوع الصورة غير مدعوم. المدعوم: JPEG, PNG, WebP', 400);
    }
    const maxImgSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxImgSize) return apiError('حجم الصورة كبير. الحد الأقصى: 5MB', 400);

    const ext = path.extname(file.name || '.jpg').toLowerCase() || '.jpg';
    const secureFilename = `thumb_${courseId}_${crypto.randomUUID()}${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'thumbnails');
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, secureFilename);
    const arrayBuf = await file.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuf));
    const publicUrl = `/thumbnails/${secureFilename}`;
    await Course.findByIdAndUpdate(courseId, { $set: { thumbnail: publicUrl } });
    return apiSuccess({ thumbnail: publicUrl, message: 'تم رفع الصورة بنجاح' });
  }

  // --- Lesson file upload (video / pdf) ---
  const moduleIndex = parseInt(formData.get('moduleIndex') as string);
  const lessonIndex = parseInt(formData.get('lessonIndex') as string);

  console.log('[upload] courseId:', courseId, '| module:', moduleIndex, 'lesson:', lessonIndex, '| type:', lessonType, '| file:', file?.name, '| size:', file?.size);

  if (isNaN(moduleIndex) || isNaN(lessonIndex)) return apiError('فهرس الوحدة أو الدرس غير صحيح', 400);

  // Validate file type
  const allowedTypes: Record<string, { mimes: string[]; exts: string[] }> = {
    video: {
      mimes: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v', 'video/x-msvideo', 'video/x-matroska'],
      exts: ['.mp4', '.webm', '.ogg', '.mov', '.m4v', '.avi', '.mkv'],
    },
    pdf: {
      mimes: ['application/pdf'],
      exts: ['.pdf'],
    },
  };

  const allowed = allowedTypes[lessonType];
  if (!allowed) return apiError('نوع الدرس غير صالح', 400);

  const fileExt = path.extname(file.name || '').toLowerCase();
  const isMimeAllowed = !!file.type && (allowed.mimes.includes(file.type) || (lessonType === 'video' && file.type.startsWith('video/')));
  const isExtAllowed = allowed.exts.includes(fileExt);

  if (!isMimeAllowed && !isExtAllowed) {
    return apiError(`نوع الملف غير مدعوم لهذا الدرس`, 400);
  }

  // File size limits: 1.5GB for video, 50MB for PDF
  const maxSize = lessonType === 'video' ? Math.floor(1.5 * 1024 * 1024 * 1024) : 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return apiError(`حجم الملف كبير. الحد الأقصى: ${lessonType === 'video' ? '1.5GB' : '50MB'}`, 400);
  }

  // Validate indices exist
  if (!course.modules[moduleIndex] || !course.modules[moduleIndex].lessons[lessonIndex]) {
    return apiError('الوحدة أو الدرس غير موجود', 404);
  }

  // Generate secure filename
  const ext = fileExt || (lessonType === 'video' ? '.mp4' : '.pdf');
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
    const webStream = file.stream();
    const nodeStream = Readable.fromWeb(webStream as any);
    await pipeline(nodeStream, createWriteStream(filePath));
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
