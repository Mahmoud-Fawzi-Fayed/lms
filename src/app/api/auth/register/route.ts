import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { registerSchema } from '@/lib/validations';
import { rateLimit, apiError, apiSuccess } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    // Rate limit registration
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    if (!rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
      return apiError('محاولات تسجيل كثيرة جداً. حاول مرة أخرى لاحقاً.', 429);
    }

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    await connectDB();

    // Check if email already exists
    const existingUser = await User.findOne({ email: parsed.data.email });
    if (existingUser) {
      return apiError('البريد الإلكتروني مسجل بالفعل', 409);
    }

    // Create user
    const user = await User.create({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      phone: parsed.data.phone,
      academicYear: parsed.data.academicYear,
      role: 'student', // Always register as student
    });

    return apiSuccess(
      {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      201
    );
  } catch (error: any) {
    console.error('Registration error:', error);
    return apiError('فشل إنشاء الحساب. حاول مرة أخرى.', 500);
  }
}
