import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { Course, Enrollment, Exam, ExamAttempt, Payment } from '@/models';
import mongoose from 'mongoose';

export const GET = withAuth(async (req) => {
  const id = req.nextUrl.pathname.split('/')[5];

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return apiError('معرف الكورس غير صالح', 400);
  }

  const course = await Course.findById(id)
    .populate('instructor', 'name email')
    .lean();

  if (!course) {
    return apiError('الكورس غير موجود', 404);
  }

  const examIds = (await Exam.find({ course: id }).select('_id').lean()).map((e) => e._id);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    totalEnrollments,
    avgProgressAgg,
    totalRevenueAgg,
    paidPaymentsCount,
    totalExams,
    totalExamAttempts,
    students,
    recentPayments,
    enrollmentsTrendAgg,
    paymentsTrendAgg,
  ] = await Promise.all([
    Enrollment.countDocuments({ course: id, status: 'active' }),
    Enrollment.aggregate([
      { $match: { course: new mongoose.Types.ObjectId(id), status: 'active' } },
      { $group: { _id: null, avgProgress: { $avg: '$progress.percentage' } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          course: new mongoose.Types.ObjectId(id),
          status: 'paid',
          method: { $in: ['card', 'wallet', 'fawry'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.countDocuments({
      course: id,
      status: 'paid',
      method: { $in: ['card', 'wallet', 'fawry'] },
    }),
    Exam.countDocuments({ course: id }),
    ExamAttempt.countDocuments({
      exam: { $in: examIds },
      status: { $in: ['submitted', 'timed-out'] },
    }),
    Enrollment.find({ course: id, status: 'active' })
      .populate('user', 'name email')
      .sort({ 'progress.percentage': -1, enrolledAt: -1 })
      .limit(20)
      .lean(),
    Payment.find({
      course: id,
      method: { $in: ['card', 'wallet', 'fawry'] },
    })
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    Enrollment.aggregate([
      {
        $match: {
          course: new mongoose.Types.ObjectId(id),
          status: 'active',
          enrolledAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: { y: { $year: '$enrolledAt' }, m: { $month: '$enrolledAt' } },
          enrollments: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    Payment.aggregate([
      {
        $match: {
          course: new mongoose.Types.ObjectId(id),
          status: 'paid',
          method: { $in: ['card', 'wallet', 'fawry'] },
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
          payments: { $sum: 1 },
          revenue: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
  ]);

  const makeMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const months: { key: string; label: string }[] = [];
  const iter = new Date(sixMonthsAgo);

  for (let i = 0; i < 6; i++) {
    const d = new Date(iter.getFullYear(), iter.getMonth() + i, 1);
    months.push({ key: makeMonthKey(d), label: d.toLocaleDateString('ar-EG', { month: 'short' }) });
  }

  const enrollmentsByMonth = new Map(
    enrollmentsTrendAgg.map((row: any) => [`${row._id.y}-${String(row._id.m).padStart(2, '0')}`, row.enrollments])
  );
  const paymentsByMonth = new Map(
    paymentsTrendAgg.map((row: any) => [`${row._id.y}-${String(row._id.m).padStart(2, '0')}`, row.payments])
  );
  const revenueByMonth = new Map(
    paymentsTrendAgg.map((row: any) => [`${row._id.y}-${String(row._id.m).padStart(2, '0')}`, row.revenue])
  );

  return apiSuccess({
    course: {
      _id: course._id,
      title: course.title,
      category: course.category,
      level: course.level,
      isPublished: course.isPublished,
      instructor: (course.instructor as any)?.name || 'غير معروف',
      instructorEmail: (course.instructor as any)?.email || '-',
    },
    stats: {
      totalEnrollments,
      totalExams,
      totalExamAttempts,
      paidPaymentsCount,
      totalRevenue: totalRevenueAgg[0]?.total || 0,
      avgProgress: Math.round(avgProgressAgg[0]?.avgProgress || 0),
    },
    students: students.map((row: any) => ({
      enrollmentId: row._id,
      name: row.user?.name || '-',
      email: row.user?.email || '-',
      progress: Math.round(row.progress?.percentage || 0),
      enrolledAt: row.enrolledAt,
      status: row.status,
    })),
    recentPayments,
    trends: {
      enrollments: months.map((m) => ({ label: m.label, value: enrollmentsByMonth.get(m.key) || 0 })),
      payments: months.map((m) => ({ label: m.label, value: paymentsByMonth.get(m.key) || 0 })),
      revenue: months.map((m) => ({ label: m.label, value: revenueByMonth.get(m.key) || 0 })),
    },
  });
}, ['admin']);
