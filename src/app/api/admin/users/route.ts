import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { User } from '@/models';

// GET /api/admin/users - List all users
export const GET = withAuth(async (req, user) => {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const role = searchParams.get('role');
  const search = searchParams.get('search');

  const filter: any = {};
  if (role) filter.role = role;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
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

// PUT /api/admin/users - Update user (role, active status)
export const PUT = withAuth(async (req, user) => {
  const body = await req.json();
  const { userId, role, isActive } = body;

  if (!userId) return apiError('معرف المستخدم مطلوب');

  const update: any = {};
  if (role && ['admin', 'instructor', 'student'].includes(role)) {
    update.role = role;
  }
  if (typeof isActive === 'boolean') {
    update.isActive = isActive;
  }

  const updated = await User.findByIdAndUpdate(userId, update, { new: true })
    .select('-password')
    .lean();

  if (!updated) return apiError('المستخدم غير موجود', 404);

  return apiSuccess(updated);
}, ['admin']);
