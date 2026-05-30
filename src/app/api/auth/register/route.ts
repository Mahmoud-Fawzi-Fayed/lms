import { NextRequest } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { Course } from '@/models';
import { registerSchema } from '@/lib/validations';
import { rateLimit, apiError, apiSuccess } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    // Rate limit registration
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    if (!rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
      return apiError('محاولات تسجيل كثيرة جداً. حاول مرة أخرى لاحقاً.', 429);
    }

    let body: any;
    try { body = await req.json(); } catch { return apiError('بيانات غير صالحة', 400); }
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    // Self-registration must be tied to a course purchase.
    // Admins create users through a separate privileged route.
    if (!parsed.data.courseId) {
      return apiError('يجب تحديد كورس للاشتراك فيه لإتمام التسجيل', 400);
    }

    await connectDB();

    // Verify the target course exists and is published before creating the account.
    const course = await Course.findById(parsed.data.courseId).select('_id isPublished title');
    if (!course || !course.isPublished) {
      return apiError('الكورس المحدد غير موجود أو غير منشور', 404);
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: parsed.data.email });
    if (existingUser) {
      return apiError('البريد الإلكتروني مسجل بالفعل', 409);
    }

    // Create user. subscriptionStatus starts as 'active' so the student
    // can log in immediately and complete the course payment on the next step.
    const user = await User.create({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      phone: parsed.data.phone,
      academicYear: parsed.data.academicYear,
      academicTerm: parsed.data.academicTerm,
      role: 'student',
      subscriptionStatus: 'active',
      subscriptionMethod: parsed.data.subscriptionMethod,
      subscriptionStartedAt: new Date(),
    });

    return apiSuccess(
      {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        academicTerm: user.academicTerm,
        subscriptionStatus: user.subscriptionStatus,
        // Return the courseId so the client can immediately initiate payment.
        courseId: parsed.data.courseId,
      },
      201
    );
  } catch (error: any) {
    console.error('Registration error:', error);
    return apiError('فشل إنشاء الحساب. حاول مرة أخرى.', 500);
  }
}
