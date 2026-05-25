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
  let body: any;
  try { body = await req.json(); } catch { return apiError('بيانات غير صالحة', 400); }

  const update: any = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 100) {
      return apiError('الاسم يجب أن يكون بين 2 و 100 حرف', 400);
    }
    update.name = name;
  }
  if (body.phone !== undefined) {
    const phone = String(body.phone).trim();
    if (phone && !/^[+0-9 \-()]{6,20}$/.test(phone)) {
      return apiError('رقم الهاتف غير صالح', 400);
    }
    update.phone = phone || undefined;
  }
  if (body.avatar !== undefined) {
    const avatar = String(body.avatar).trim();
    // Reject javascript:/data:/vbscript: URLs and anything over 500 chars.
    if (avatar && (avatar.length > 500 || !/^(https?:\/\/|\/)/i.test(avatar))) {
      return apiError('رابط الصورة غير صالح', 400);
    }
    update.avatar = avatar || undefined;
  }

  // If changing password
  if (body.currentPassword && body.newPassword) {
    const fullUser = await User.findById(user.id).select('+password');
    if (!fullUser) return apiError('المستخدم غير موجود', 404);

    const isValid = await fullUser.comparePassword(body.currentPassword);
    if (!isValid) return apiError('كلمة المرور الحالية غير صحيحة', 400);

    const newPw = String(body.newPassword);
    if (newPw.length < 8 || newPw.length > 128) {
      return apiError('كلمة المرور الجديدة يجب أن تكون بين 8 و 128 حرفاً', 400);
    }
    // Require at least one letter and one digit — basic complexity baseline.
    if (!/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) {
      return apiError('كلمة المرور يجب أن تحتوي على حرف ورقم على الأقل', 400);
    }
    if (newPw === body.currentPassword) {
      return apiError('كلمة المرور الجديدة يجب أن تختلف عن الحالية', 400);
    }

    fullUser.password = newPw;
    Object.assign(fullUser, update);
    await fullUser.save();

    return apiSuccess({ message: 'تم تحديث الملف الشخصي' });
  }

  if (Object.keys(update).length === 0) {
    return apiError('لا يوجد بيانات للتحديث', 400);
  }

  await User.findByIdAndUpdate(user.id, update, { runValidators: true });
  return apiSuccess({ message: 'تم تحديث الملف الشخصي' });
});
