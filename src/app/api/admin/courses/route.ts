import { withAuth, apiSuccess } from '@/lib/api-helpers';
import { Course } from '@/models';

// GET /api/admin/courses - List all courses for admin (including drafts)
export const GET = withAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 200);
  const search = searchParams.get('search');
  const status = searchParams.get('status');

  const filter: Record<string, any> = {};

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
    ];
  }

  if (status === 'published') filter.isPublished = true;
  if (status === 'draft') filter.isPublished = false;

  const skip = (page - 1) * limit;

  const [courses, total] = await Promise.all([
    Course.find(filter)
      .populate('instructor', 'name email')
      .select('title slug category level price discountPrice targetYear isPublished enrollmentCount instructor createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Course.countDocuments(filter),
  ]);

  return apiSuccess({
    courses,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}, ['admin']);
