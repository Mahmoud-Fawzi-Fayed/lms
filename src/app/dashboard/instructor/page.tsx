'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import Link from 'next/link';
import { formatPrice } from '@/lib/utils';
import { exportToExcel, exportToPdf } from '@/lib/export-utils';
import { MiniBarChart, MiniLineChart } from '@/components/analytics/Charts';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';

export default function InstructorDashboard() {
  useLang();
  const { data: session, status } = useSession();
  const instructorLinks = [
    { href: '/dashboard/instructor', label: t('لوحة التحكم', 'Dashboard'), icon: '📊' },
    { href: '/dashboard/instructor/courses', label: t('كورساتي', 'My Courses'), icon: '📚' },
    { href: '/dashboard/instructor/courses/new', label: t('إنشاء كورس', 'Create Course'), icon: '➕' },
    { href: '/dashboard/instructor/exams', label: t('الاختبارات', 'Exams'), icon: '📝' },
  ];
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && (session?.user as any)?.role !== 'instructor' && (session?.user as any)?.role !== 'admin') router.push('/dashboard');
  }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') fetchStats();
  }, [status]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/instructor/stats');
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch {
      toast.error(t('فشل تحميل الإحصائيات', 'Failed to load stats'));
    } finally {
      setLoading(false);
    }
  };

  const courseColumns = [
    { header: t('اسم الكورس', 'Course Name'), value: (r: any) => r.title },
    { header: t('الحالة', 'Status'), value: (r: any) => (r.isPublished ? t('منشور', 'Published') : t('مسودة', 'Draft')) },
    { header: t('عدد الطلاب', 'Students'), value: (r: any) => r.enrollments },
    { header: t('متوسط التقدم %', 'Avg Progress %'), value: (r: any) => r.avgProgress },
    { header: t('الإيراد', 'Revenue'), value: (r: any) => r.revenue },
    { header: t('عدد المدفوعات', 'Payments'), value: (r: any) => r.paymentsCount },
  ];

  const examColumns = [
    { header: t('اسم الاختبار', 'Exam Name'), value: (r: any) => r.title },
    { header: t('مرتبط بكورس', 'Linked Course'), value: (r: any) => r.courseTitle || '-' },
    { header: t('الحالة', 'Status'), value: (r: any) => (r.isPublished ? t('منشور', 'Published') : t('مسودة', 'Draft')) },
    { header: t('عدد المحاولات', 'Attempts'), value: (r: any) => r.attempts },
    { header: t('متوسط الدرجة %', 'Avg Score %'), value: (r: any) => r.avgScore },
    { header: t('معدل النجاح %', 'Pass Rate %'), value: (r: any) => r.passRate },
    { header: t('الإيراد', 'Revenue'), value: (r: any) => r.revenue },
  ];

  const exportCoursesExcel = async () => {
    const rows = stats?.analytics?.coursePerformance || [];
    await exportToExcel('instructor-courses-stats.xlsx', 'Courses', rows, courseColumns);
  };

  const exportCoursesPdf = async () => {
    const rows = stats?.analytics?.coursePerformance || [];
    await exportToPdf('instructor-courses-stats.pdf', 'Instructor Courses Analytics', rows, courseColumns);
  };

  const exportExamsExcel = async () => {
    const rows = stats?.analytics?.examPerformance || [];
    await exportToExcel('instructor-exams-stats.xlsx', 'Exams', rows, examColumns);
  };

  const exportExamsPdf = async () => {
    const rows = stats?.analytics?.examPerformance || [];
    await exportToPdf('instructor-exams-stats.pdf', 'Instructor Exams Analytics', rows, examColumns);
  };

  return (
    <DashboardSidebar links={instructorLinks}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-slate-900">{t('لوحة تحكم المحاضر', 'Instructor Dashboard')}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCoursesExcel}
              className="px-3 py-2 bg-white border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 text-sm"
            >
              {t('تصدير الكورسات Excel', 'Export Courses Excel')}
            </button>
            <button
              onClick={exportCoursesPdf}
              className="px-3 py-2 bg-white border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 text-sm"
            >
              {t('تصدير الكورسات PDF', 'Export Courses PDF')}
            </button>
            <button
              onClick={exportExamsExcel}
              className="px-3 py-2 bg-white border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 text-sm"
            >
              {t('تصدير الاختبارات Excel', 'Export Exams Excel')}
            </button>
            <button
              onClick={exportExamsPdf}
              className="px-3 py-2 bg-white border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 text-sm"
            >
              {t('تصدير الاختبارات PDF', 'Export Exams PDF')}
            </button>
            <Link
              href="/dashboard/instructor/courses/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              + {t('كورس جديد', 'New Course')}
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-24 mb-4" />
                <div className="h-8 bg-gray-200 rounded w-16" />
              </div>
            ))}
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">{t('كورساتي', 'My Courses')}</span>
                  <span className="text-2xl">📚</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.stats.totalCourses}</div>
                <div className="text-xs text-slate-500 mt-1">{stats.stats.publishedCourses} {t('منشور', 'published')}</div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">{t('إجمالي الطلاب', 'Total Students')}</span>
                  <span className="text-2xl">🎓</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.stats.totalEnrollments}</div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">{t('اختباراتي', 'My Exams')}</span>
                  <span className="text-2xl">📝</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.stats.totalExams}</div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">{t('محاولات الاختبارات', 'Exam Attempts')}</span>
                  <span className="text-2xl">📈</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.stats.totalExamAttempts}</div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">{t('الإيرادات', 'Revenue')}</span>
                  <span className="text-2xl">💰</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{formatPrice(stats.stats.totalRevenue)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="font-semibold text-slate-900 mb-4">{t('اتجاه الإيرادات (آخر 6 أشهر)', 'Revenue Trend (Last 6 Months)')}</h2>
                <MiniLineChart
                  data={(stats.analytics?.revenueTrend || []).map((item: any) => ({
                    label: item.label,
                    value: item.revenue,
                  }))}
                />
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="font-semibold text-slate-900 mb-4">{t('اتجاه المدفوعات الناجحة (آخر 6 أشهر)', 'Successful Payments Trend (Last 6 Months)')}</h2>
                <MiniLineChart
                  data={(stats.analytics?.paymentsTrend || []).map((item: any) => ({
                    label: item.label,
                    value: item.payments,
                  }))}
                  stroke="#14b8a6"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="font-semibold text-slate-900 mb-4">{t('أفضل الكورسات حسب عدد المدفوعات', 'Top Courses by Payments')}</h2>
                <MiniBarChart
                  data={(stats.analytics?.coursePerformance || [])
                    .slice()
                    .sort((a: any, b: any) => b.paymentsCount - a.paymentsCount)
                    .slice(0, 6)
                    .map((course: any) => ({
                      label: course.title,
                      value: course.paymentsCount,
                    }))}
                />
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="font-semibold text-slate-900 mb-4">{t('أفضل الاختبارات حسب عدد المحاولات', 'Top Exams by Attempts')}</h2>
                <MiniBarChart
                  data={(stats.analytics?.examPerformance || [])
                    .slice()
                    .sort((a: any, b: any) => b.attempts - a.attempts)
                    .slice(0, 6)
                    .map((exam: any) => ({
                      label: exam.title,
                      value: exam.attempts,
                    }))}
                  color="bg-teal-500"
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
              <h2 className="font-semibold text-slate-900 mb-4">{t('أداء الكورسات', 'Course Performance')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="text-right bg-accent-50 text-xs text-accent-500">
                      <th className="px-4 py-3">{t('الكورس', 'Course')}</th>
                      <th className="px-4 py-3">{t('الحالة', 'Status')}</th>
                      <th className="px-4 py-3">{t('عدد الطلاب', 'Students')}</th>
                      <th className="px-4 py-3">{t('متوسط التقدم', 'Avg Progress')}</th>
                      <th className="px-4 py-3">{t('الإيراد', 'Revenue')}</th>
                      <th className="px-4 py-3">{t('إجراءات', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-accent-100">
                    {(stats.analytics?.coursePerformance || []).map((course: any) => (
                      <tr key={course.courseId} className="text-sm">
                        <td className="px-4 py-3 font-medium text-accent-900">{course.title}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${course.isPublished ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {course.isPublished ? t('منشور', 'Published') : t('مسودة', 'Draft')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-accent-700">{course.enrollments}</td>
                        <td className="px-4 py-3 text-accent-700">{course.avgProgress}%</td>
                        <td className="px-4 py-3 font-semibold text-accent-900">{formatPrice(course.revenue)}</td>
                        <td className="px-4 py-3">
                          <Link href={`/dashboard/instructor/courses/${course.courseId}`} className="text-primary-600 hover:underline">
                            {t('فتح', 'Open')}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="font-semibold text-slate-900 mb-4">{t('أداء الاختبارات', 'Exam Performance')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="text-right bg-accent-50 text-xs text-accent-500">
                      <th className="px-4 py-3">{t('الاختبار', 'Exam')}</th>
                      <th className="px-4 py-3">{t('الكورس المرتبط', 'Linked Course')}</th>
                      <th className="px-4 py-3">{t('المحاولات', 'Attempts')}</th>
                      <th className="px-4 py-3">{t('متوسط الدرجة', 'Avg Score')}</th>
                      <th className="px-4 py-3">{t('معدل النجاح', 'Pass Rate')}</th>
                      <th className="px-4 py-3">{t('الإيراد', 'Revenue')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-accent-100">
                    {(stats.analytics?.examPerformance || []).map((exam: any) => (
                      <tr key={exam.examId} className="text-sm">
                        <td className="px-4 py-3 font-medium text-accent-900">{exam.title}</td>
                        <td className="px-4 py-3 text-accent-700">{exam.courseTitle || t('اختبار مستقل', 'Independent Exam')}</td>
                        <td className="px-4 py-3 text-accent-700">{exam.attempts}</td>
                        <td className="px-4 py-3 text-accent-700">{exam.avgScore}%</td>
                        <td className="px-4 py-3 text-accent-700">{exam.passRate}%</td>
                        <td className="px-4 py-3 font-semibold text-accent-900">{formatPrice(exam.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardSidebar>
  );
}
