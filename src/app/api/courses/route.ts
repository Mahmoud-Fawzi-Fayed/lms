import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess, getAuthUser } from '@/lib/api-helpers';
import { Course } from '@/models';
import { courseSchema } from '@/lib/validations';
import connectDB from '@/lib/db';

// GET /api/courses - List courses (public)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '12'), 50);
    const category = searchParams.get('category');
    const level = searchParams.get('level');
    const search = searchParams.get('search');
    const sort = searchParams.get('sort') || 'newest';

    await connectDB();

    // Identify caller — students see only their year's courses
    const user = await getAuthUser(req);

    const baseFilter: any = { isPublished: true };

    // Students only see courses assigned to their exact academic year
    if (user?.role === 'student') {
      if (!user.academicYear) {
        baseFilter._id = null;
      } else {
        baseFilter.targetYear = user.academicYear;
      }
    }

    if (search) {
      baseFilter.$text = { $search: search };
    }

    const filter: any = { ...baseFilter };

    if (category) filter.category = category;
    if (level) filter.level = level;

    let sortOption: any = { createdAt: -1 };
    switch (sort) {
      case 'popular':
        sortOption = { enrollmentCount: -1 };
        break;
      case 'price-low':
        sortOption = { price: 1 };
        break;
      case 'price-high':
        sortOption = { price: -1 };
        break;
      case 'rating':
        sortOption = { rating: -1 };
        break;
    }

    const skip = (page - 1) * limit;

    const [courses, total, categories, levels] = await Promise.all([
      Course.find(filter)
        .populate('instructor', 'name avatar')
        .select('-modules.lessons.filePath -modules.lessons.content')
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Course.countDocuments(filter),
      Course.distinct('category', baseFilter),
      Course.distinct('level', baseFilter),
    ]);

    return apiSuccess({
      courses,
      filters: {
        categories: categories.filter(Boolean).sort(),
        levels: levels.filter(Boolean).sort(),
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return apiError(error.message, 500);
  }
}

// POST /api/courses - Create course (instructor/admin only)
export const POST = withAuth(async (req, user) => {
  const body = await req.json();
  const parsed = courseSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.errors[0].message);
  }

  const normalizedPrice = Math.max(0, Number(parsed.data.price) || 0);
  const normalizedDiscount =
    normalizedPrice === 0
      ? undefined
      : (parsed.data.discountPrice != null && Number(parsed.data.discountPrice) > 0 && Number(parsed.data.discountPrice) < normalizedPrice
        ? Number(parsed.data.discountPrice)
        : undefined);

  const course = await Course.create({
    ...parsed.data,
    price: normalizedPrice,
    discountPrice: normalizedDiscount,
    instructor: user.id,
    modules: parsed.data.modules || [],
  });

  return apiSuccess(course, 201);
}, ['instructor', 'admin']);
