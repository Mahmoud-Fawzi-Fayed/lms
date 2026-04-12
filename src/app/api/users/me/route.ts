import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { User, Enrollment, Course, ExamAttempt, Payment } from '@/models';

// GET /api/users/me - Get current user profile
export const GET = withAuth(async (req, user) => {
  const fullUser = await User.findById(user.id).lean();
  if (!fullUser) return apiError('المستخدم غير موجود', 404);

  return apiSuccess({
    id: fullUser._id,
    name: fullUser.name,
    email: fullUser.email,
    phone: fullUser.phone,
    role: fullUser.role,
    avatar: fullUser.avatar,
    isActive: fullUser.isActive,
    createdAt: fullUser.createdAt,
  });
});

// PUT /api/users/me - Update profile
export const PUT = withAuth(async (req, user) => {
  const body = await req.json();

  const allowedFields = ['name', 'phone', 'avatar'];
  const update: any = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      update[field] = body[field];
    }
  }

  // If changing password
  if (body.currentPassword && body.newPassword) {
    const fullUser = await User.findById(user.id).select('+password');
    if (!fullUser) return apiError('المستخدم غير موجود', 404);

    const isValid = await fullUser.comparePassword(body.currentPassword);
    if (!isValid) return apiError('كلمة المرور الحالية غير صحيحة', 400);

    if (body.newPassword.length < 8) {
      return apiError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل', 400);
    }

    fullUser.password = body.newPassword;
    Object.assign(fullUser, update);
    await fullUser.save();

    return apiSuccess({ message: 'تم تحديث الملف الشخصي' });
  }

  await User.findByIdAndUpdate(user.id, update, { runValidators: true });
  return apiSuccess({ message: 'تم تحديث الملف الشخصي' });
});
