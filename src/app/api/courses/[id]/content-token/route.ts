import { NextRequest } from 'next/server';
import { getAuthUser, apiError, apiSuccess } from '@/lib/api-helpers';
import { Enrollment, Course } from '@/models';
import { generateContentToken } from '@/lib/content-token';
import connectDB from '@/lib/db';

// GET /api/courses/[id]/content-token?lessonId=xxx
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();

    const user = await getAuthUser(req);
    if (!user) return apiError('يجب تسجيل الدخول', 401);

    const lessonId = req.nextUrl.searchParams.get('lessonId');
    if (!lessonId) return apiError('معرف الدرس مطلوب', 400);

    const course = await Course.findById(params.id).select('targetYear').lean();
    if (!course) return apiError('الكورس غير موجود', 404);

    if (user.role === 'student' && course.targetYear && user.academicYear !== course.targetYear) {
      return apiError('هذا المحتوى غير متاح لسنتك الدراسية', 403);
    }

    // Verify enrollment
    const enrollment = await Enrollment.findOne({
      user: user.id,
      course: params.id,
      status: 'active',
    });

    if (!enrollment) return apiError('أنت غير مشترك في هذا الكورس', 403);

    const token = generateContentToken(user.id, params.id, lessonId);
    return apiSuccess({ token });
  } catch (error: any) {
    return apiError(error.message, 500);
  }
}
