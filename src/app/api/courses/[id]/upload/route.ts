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
  // SECURITY: uploadId is client-controlled and used to build a filename — restrict to
  // safe chars to block path traversal (../) and absolute paths. Anything invalid is
  // replaced with a fresh random id.
  const rawUploadId = String(formData.get('uploadId') || '');
  const uploadId = /^[A-Za-z0-9_-]{1,64}$/.test(rawUploadId) ? rawUploadId : '';
  const chunkIndex = Number(formData.get('chunkIndex') || 0);
  const totalChunks = Number(formData.get('totalChunks') || 1);
  const originalFileName = String(formData.get('originalFileName') || file?.name || '');
  const totalFileSize = Number(formData.get('totalFileSize') || file?.size || 0);

  if (!file) return apiError('لم يتم اختيار ملف', 400);
  // Bounds for chunked-upload counters
  if (!Number.isFinite(chunkIndex) || chunkIndex < 0 || chunkIndex > 100_000) {
    return apiError('مؤشر الجزء غير صالح', 400);
  }
  if (!Number.isFinite(totalChunks) || totalChunks < 1 || totalChunks > 100_000) {
    return apiError('عدد الأجزاء غير صالح', 400);
  }
  if (chunkIndex >= totalChunks) {
    return apiError('مؤشر الجزء يتجاوز العدد الإجمالي', 400);
  }

  // --- Thumbnail upload ---
  if (lessonType === 'thumbnail') {
    const allowedImages = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedImages.includes(file.type)) {
      return apiError('نوع الصورة غير مدعوم. المدعوم: JPEG, PNG, WebP', 400);
    }
    const maxImgSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxImgSize) return apiError('حجم الصورة كبير. الحد الأقصى: 5MB', 400);

    // Use a tightly whitelisted extension instead of trusting path.extname on a
    // client-supplied filename (which can contain unicode confusables or odd chars).
    const extByMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    const ext = extByMime[file.type] || '.jpg';
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

  const fileExt = path.extname(originalFileName || file.name || '').toLowerCase();
  const isMimeAllowed = !!file.type && (allowed.mimes.includes(file.type) || (lessonType === 'video' && file.type.startsWith('video/')));
  const isExtAllowed = allowed.exts.includes(fileExt);

  // Require BOTH extension AND MIME match — otherwise an attacker can rename
  // a binary to .mp4 (passes ext check) while sending application/pdf, or vice versa.
  if (!isMimeAllowed || !isExtAllowed) {
    return apiError(`نوع الملف غير مدعوم لهذا الدرس`, 400);
  }

  // File size limits: 1.5GB for video, 50MB for PDF
  const maxSize = lessonType === 'video' ? Math.floor(1.5 * 1024 * 1024 * 1024) : 50 * 1024 * 1024;
  if ((totalFileSize || file.size) > maxSize) {
    return apiError(`حجم الملف كبير. الحد الأقصى: ${lessonType === 'video' ? '1.5GB' : '50MB'}`, 400);
  }

  // Validate indices exist
  if (!course.modules[moduleIndex] || !course.modules[moduleIndex].lessons[lessonIndex]) {
    return apiError('الوحدة أو الدرس غير موجود', 404);
  }

  // Generate secure filename — never trust client-supplied parts for the on-disk name.
  // ext was already validated against `allowed.exts` above.
  const ext = allowed.exts.includes(fileExt) ? fileExt : (lessonType === 'video' ? '.mp4' : '.pdf');
  const stableUploadId = uploadId || crypto.randomUUID();
  // lessonType was already constrained to 'video' | 'pdf' by the `allowed` lookup above,
  // so the directory name is safe; pin it explicitly to avoid any future drift.
  const subDir = lessonType === 'video' ? 'videos' : 'pdfs';
  const secureFilename = `${courseId}_${stableUploadId}${ext}`;
  const uploadDir = path.join(process.cwd(), 'uploads', subDir);
  // Defence-in-depth: make sure resolved paths stay inside uploadDir.
  const _resolvedUploadDir = path.resolve(uploadDir);

  try {
    await fs.mkdir(uploadDir, { recursive: true });
  } catch (e: any) {
    console.error('[upload] mkdir error:', e?.message);
    return apiError('فشل إنشاء مجلد الرفع', 500);
  }

  const filePath = path.join(uploadDir, secureFilename);
  if (!path.resolve(filePath).startsWith(_resolvedUploadDir + path.sep)) {
    return apiError('مسار الملف غير صالح', 400);
  }
  try {
    if (totalChunks > 1) {
      const tempDir = path.join(process.cwd(), 'uploads', 'tmp');
      await fs.mkdir(tempDir, { recursive: true });
      const _resolvedTempDir = path.resolve(tempDir);
      const tempPath = path.join(tempDir, `${courseId}_${stableUploadId}${ext}.part`);
      if (!path.resolve(tempPath).startsWith(_resolvedTempDir + path.sep)) {
        return apiError('مسار الملف المؤقت غير صالح', 400);
      }
      const chunkBuffer = Buffer.from(await file.arrayBuffer());

      if (chunkIndex === 0) {
        await fs.writeFile(tempPath, chunkBuffer);
      } else {
        await fs.appendFile(tempPath, chunkBuffer);
      }

      if (chunkIndex < totalChunks - 1) {
        return apiSuccess({
          partial: true,
          chunkIndex,
          totalChunks,
          percent: Math.round(((chunkIndex + 1) / totalChunks) * 100),
          message: 'تم استلام جزء من الملف',
        });
      }

      await fs.rename(tempPath, filePath);
    } else {
      const webStream = file.stream();
      const nodeStream = Readable.fromWeb(webStream as any);
      await pipeline(nodeStream, createWriteStream(filePath));
    }
  } catch (e: any) {
    console.error('[upload] write error:', e?.message);
    return apiError('فشل كتابة الملف على الخادم', 500);
  }

  // Update lesson using $set with direct path — avoids markModified issues
  // filePath has select:false so direct $set is safer than load+save
  try {
    await Course.findByIdAndUpdate(courseId, {
      $set: {
        [`modules.${moduleIndex}.lessons.${lessonIndex}.filePath`]: filePath,
        [`modules.${moduleIndex}.lessons.${lessonIndex}.fileUrl`]: 'uploaded',
        // Ensure lesson type matches the uploaded file type (video/pdf)
        [`modules.${moduleIndex}.lessons.${lessonIndex}.type`]: lessonType,
      },
    });
  } catch (e: any) {
    console.error('[upload] save error:', e?.message);
    // Clean up uploaded file on DB save failure
    await fs.unlink(filePath).catch(() => {});
    return apiError('فشل حفظ بيانات الكورس', 500);
  }

  return apiSuccess({ message: 'تم رفع الملف بنجاح' });
}, ['instructor', 'admin']);
