import { NextRequest } from 'next/server';
import { apiError, apiSuccess, getAuthUser } from '@/lib/api-helpers';
import { Course, Exam, ExamAttempt } from '@/models';
import connectDB from '@/lib/db';
import mongoose from 'mongoose';

// GET /api/exams/[id]/leaderboard - Get exam leaderboard
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();

    const user = await getAuthUser(req);
    if (!user) {
      return apiError('يجب تسجيل الدخول', 401);
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return apiError('معرف الاختبار غير صالح', 400);
    }

    const exam = await Exam.findById(params.id).select('course createdBy isPublished');
    if (!exam) {
      return apiError('الاختبار غير موجود', 404);
    }

    const course = exam.course ? await Course.findById(exam.course).select('instructor') : null;
    const isOwnerOrAdmin =
      user.role === 'admin' ||
      exam.createdBy?.toString() === user.id ||
      course?.instructor?.toString() === user.id;

    const hasCompletedAttempt = await ExamAttempt.exists({
      exam: params.id,
      user: user.id,
      status: { $in: ['submitted', 'timed-out'] },
    });

    if (!isOwnerOrAdmin && !hasCompletedAttempt) {
      return apiError('غير مصرح لك بعرض قائمة المتفوقين لهذا الاختبار', 403);
    }

    // Aggregate best scores per user.
    // Sort first so $first picks the real best attempt for passed/status fields.
    const leaderboard = await ExamAttempt.aggregate([
      {
        $match: {
          exam: new mongoose.Types.ObjectId(params.id),
          status: { $in: ['submitted', 'timed-out'] },
        },
      },
      { $sort: { score: -1, timeSpent: 1, submittedAt: -1 } },
      {
        $group: {
          _id: '$user',
          bestScore: { $max: '$score' },
          bestAttempt: { $first: '$$ROOT' },
          attempts: { $sum: 1 },
          fastestTime: { $min: '$timeSpent' },
        },
      },
      { $sort: { bestScore: -1, fastestTime: 1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: '$user.name',
          avatar: '$user.avatar',
          bestScore: 1,
          attempts: 1,
          fastestTime: 1,
          passed: '$bestAttempt.passed',
        },
      },
    ]);

    // Add rank
    const ranked = leaderboard.map((entry: any, index: number) => ({
      rank: index + 1,
      ...entry,
    }));

    return apiSuccess({ leaderboard: ranked });
  } catch (error: any) {
    return apiError(error.message, 500);
  }
}
