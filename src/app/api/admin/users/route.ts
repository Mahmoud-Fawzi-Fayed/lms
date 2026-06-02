import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess, escapeRegex, isValidObjectId } from '@/lib/api-helpers';
import { User } from '@/models';

// GET /api/admin/users - List all users
export const GET = withAuth(async (req, user) => {
  const { searchParams } = new URL(req.url);
  const page = Math.max(parseInt(searchParams.get('page') || '1') || 1, 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20') || 20, 1), 100);
  const role = searchParams.get('role');
  const rawSearch = searchParams.get('search');

  const filter: any = {};
  if (role && ['admin', 'instructor', 'student'].includes(role)) filter.role = role;
  if (rawSearch) {
    // Escape regex metachars to prevent NoSQL regex injection / ReDoS, and cap length.
    const safe = escapeRegex(rawSearch.slice(0, 80));
    filter.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return apiSuccess({
    users,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}, ['admin']);
ن
// PUT /api/admin/users - Update user (role, active status)
export const PUT = withAuth(async (req, user) => {
  let body: any;
  try { body = await req.json(); } catch { return apiError('بيانات غير صالحة', 400); }
  const { userId, role, isActive } = body;

  if (!userId || !isValidObjectId(userId)) return apiError('معرف المستخدم غير صالح');

  // Admin cannot demote / deactivate themselves — keeps at-least-one-admin guarantee.
  if (userId === user.id && (role !== undefined || isActive === false)) {
    return apiError('لا يمكنك تعديل صلاحياتك الخاصة', 400);
  }

  const update: any = {};
  if (role && ['admin', 'instructor', 'student'].includes(role)) {
    update.role = role;
  }
  if (typeof isActive === 'boolean') {
    update.isActive = isActive;
  }

  if (Object.keys(update).length === 0) {
    return apiError('لا يوجد بيانات للتحديث', 400);
  }

  const updated = await User.findByIdAndUpdate(userId, update, {
    new: true,
    runValidators: true,
  })
    .select('-password')
    .lean();

  if (!updated) return apiError('المستخدم غير موجود', 404);

  return apiSuccess(updated);
}, ['admin']);
