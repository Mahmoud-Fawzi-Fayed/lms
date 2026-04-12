import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-helpers';
import { User, Course, Enrollment, Payment, Exam, ExamAttempt } from '@/models';

// GET /api/admin/stats - Admin dashboard stats
export const GET = withAuth(async (req, user) => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    totalStudents,
    totalInstructors,
    totalCourses,
    totalExams,
    publishedCourses,
    totalEnrollments,
    totalRevenue,
    paymentsTrendAgg,
    totalExamAttempts,
    recentPayments,
    recentEnrollments,
    courseEnrollmentAgg,
    courseRevenueAgg,
    examAttemptsAgg,
    examRevenueAgg,
    revenueTrendAgg,
    enrollmentsTrendAgg,
    attemptsTrendAgg,
    courses,
    exams,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'instructor' }),
    Course.countDocuments(),
    Exam.countDocuments(),
    Course.countDocuments({ isPublished: true }),
    Enrollment.countDocuments({ status: 'active' }),
    Payment.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          status: 'paid',
          method: { $in: ['card', 'wallet', 'fawry'] },
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: '$createdAt' },
            m: { $month: '$createdAt' },
          },
          payments: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    ExamAttempt.countDocuments({ status: { $in: ['submitted', 'timed-out'] } }),
    Payment.find({ method: { $in: ['card', 'wallet', 'fawry'] } })
      .populate('user', 'name email')
      .populate('course', 'title')
      .populate('exam', 'title')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    Enrollment.find({ status: 'active' })
      .populate('user', 'name email')
      .populate('course', 'title')
      .sort({ enrolledAt: -1 })
      .limit(10)
      .lean(),
    Enrollment.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$course',
          enrollments: { $sum: 1 },
          avgProgress: { $avg: '$progress.percentage' },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { status: 'paid', course: { $ne: null } } },
      {
        $group: {
          _id: '$course',
          revenue: { $sum: '$amount' },
          paymentsCount: { $sum: 1 },
        },
      },
    ]),
    ExamAttempt.aggregate([
      { $match: { status: { $in: ['submitted', 'timed-out'] } } },
      {
        $group: {
          _id: '$exam',
          attempts: { $sum: 1 },
          avgScore: { $avg: '$score' },
          passCount: {
            $sum: {
              $cond: [{ $eq: ['$passed', true] }, 1, 0],
            },
          },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { status: 'paid', exam: { $ne: null } } },
      {
        $group: {
          _id: '$exam',
          revenue: { $sum: '$amount' },
        },
      },
    ]),
    Payment.aggregate([
      {
        $match: {
          status: 'paid',
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: '$createdAt' },
            m: { $month: '$createdAt' },
          },
          revenue: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    Enrollment.aggregate([
      {
        $match: {
          status: 'active',
          enrolledAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: '$enrolledAt' },
            m: { $month: '$enrolledAt' },
          },
          enrollments: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    ExamAttempt.aggregate([
      {
        $match: {
          status: { $in: ['submitted', 'timed-out'] },
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: '$createdAt' },
            m: { $month: '$createdAt' },
          },
          attempts: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    Course.find({})
      .select('title isPublished instructor enrollmentCount')
      .populate('instructor', 'name')
      .lean(),
    Exam.find({})
      .select('title isPublished createdBy course')
      .populate('course', 'title')
      .populate('createdBy', 'name')
      .lean(),
  ]);

  const makeMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const months: { key: string; label: string }[] = [];
  const iter = new Date(sixMonthsAgo);
  for (let i = 0; i < 6; i++) {
    const d = new Date(iter.getFullYear(), iter.getMonth() + i, 1);
    months.push({
      key: makeMonthKey(d),
      label: d.toLocaleDateString('ar-EG', { month: 'short' }),
    });
  }

  const revenueByMonth = new Map(
    revenueTrendAgg.map((row: any) => [
      `${row._id.y}-${String(row._id.m).padStart(2, '0')}`,
      row.revenue,
    ])
  );
  const paymentsByMonth = new Map(
    paymentsTrendAgg.map((row: any) => [
      `${row._id.y}-${String(row._id.m).padStart(2, '0')}`,
      row.payments,
    ])
  );
  const attemptsByMonth = new Map(
    attemptsTrendAgg.map((row: any) => [
      `${row._id.y}-${String(row._id.m).padStart(2, '0')}`,
      row.attempts,
    ])
  );
  const enrollmentsByMonth = new Map(
    enrollmentsTrendAgg.map((row: any) => [
      `${row._id.y}-${String(row._id.m).padStart(2, '0')}`,
      row.enrollments,
    ])
  );

  const enrollmentMap = new Map(courseEnrollmentAgg.map((r: any) => [String(r._id), r]));
  const courseRevenueMap = new Map(courseRevenueAgg.map((r: any) => [String(r._id), r]));
  const examAttemptMap = new Map(examAttemptsAgg.map((r: any) => [String(r._id), r]));
  const examRevenueMap = new Map(examRevenueAgg.map((r: any) => [String(r._id), r]));

  const coursePerformance = courses.map((c: any) => {
    const enroll = enrollmentMap.get(String(c._id));
    const rev = courseRevenueMap.get(String(c._id));
    return {
      courseId: c._id,
      title: c.title,
      instructor: (c.instructor as any)?.name || 'غير معروف',
      isPublished: c.isPublished,
      enrollments: enroll?.enrollments || 0,
      avgProgress: Math.round(enroll?.avgProgress || 0),
      revenue: rev?.revenue || 0,
      paymentsCount: rev?.paymentsCount || 0,
    };
  });

  const examPerformance = exams.map((e: any) => {
    const attempts = examAttemptMap.get(String(e._id));
    const rev = examRevenueMap.get(String(e._id));
    const attemptsCount = attempts?.attempts || 0;
    const passRate = attemptsCount > 0 ? Math.round(((attempts?.passCount || 0) / attemptsCount) * 100) : 0;
    return {
      examId: e._id,
      title: e.title,
      creator: (e.createdBy as any)?.name || 'غير معروف',
      courseTitle: (e.course as any)?.title || null,
      attempts: attemptsCount,
      avgScore: Math.round(attempts?.avgScore || 0),
      passRate,
      revenue: rev?.revenue || 0,
      isPublished: e.isPublished,
    };
  });

  return apiSuccess({
    stats: {
      totalUsers,
      totalStudents,
      totalInstructors,
      totalCourses,
      totalExams,
      publishedCourses,
      totalEnrollments,
      totalExamAttempts,
      totalRevenue: totalRevenue[0]?.total || 0,
    },
    recentPayments,
    recentEnrollments,
    analytics: {
      coursePerformance,
      examPerformance,
      revenueTrend: months.map((m) => ({
        monthKey: m.key,
        label: m.label,
        revenue: revenueByMonth.get(m.key) || 0,
      })),
      paymentsTrend: months.map((m) => ({
        monthKey: m.key,
        label: m.label,
        payments: paymentsByMonth.get(m.key) || 0,
      })),
      enrollmentsTrend: months.map((m) => ({
        monthKey: m.key,
        label: m.label,
        enrollments: enrollmentsByMonth.get(m.key) || 0,
      })),
      attemptsTrend: months.map((m) => ({
        monthKey: m.key,
        label: m.label,
        attempts: attemptsByMonth.get(m.key) || 0,
      })),
    },
  });
}, ['admin']);
