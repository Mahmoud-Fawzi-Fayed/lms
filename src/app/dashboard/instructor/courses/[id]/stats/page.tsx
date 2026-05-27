'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import { MiniBarChart, MiniLineChart } from '@/components/analytics/Charts';
import { formatPrice } from '@/lib/utils';
import { exportToPdf } from '@/lib/export-utils';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';

export default function InstructorCourseStatsPage() {
  const { data: session, status } = useSession();
  useLang();
  const instructorLinks = [
    { href: '/dashboard/instructor', label: t('لوحة التحكم', 'Dashboard'), icon: '📊' },
    { href: '/dashboard/instructor/courses', label: t('كورساتي', 'My Courses'), icon: '📚' },
    { href: '/dashboard/instructor/courses/new', label: t('إنشاء كورس', 'Create Course'), icon: '➕' },
    { href: '/dashboard/instructor/exams', label: t('الاختبارات', 'Exams'), icon: '📝' },
  ];
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated') {
      const role = (session?.user as any)?.role;
      if (role !== 'instructor' && role !== 'admin') router.push('/dashboard');
    }
  }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated' && params?.id) fetchStats();
  }, [status, params?.id]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instructor/stats/courses/${params.id}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  };

  const exportStudentsPdf = async () => {
    await exportToPdf(
      `course-${params.id}-students.pdf`,
      `${t('إحصائيات طلاب الكورس:', 'Course Students Stats:')} ${data?.course?.title || ''}`,      data?.students || [],
      [
        { header: t('الاسم', 'Name'), value: (r: any) => r.name },
        { header: t('البريد', 'Email'), value: (r: any) => r.email },
        { header: t('نسبة التقدم', 'Progress %'), value: (r: any) => `${r.progress}%` },
        { header: t('تاريخ التسجيل', 'Enrollment Date'), value: (r: any) => new Date(r.enrolledAt).toLocaleDateString('ar-EG') },
      ]
    );
  };

  if (loading) {
    return (
      <DashboardSidebar links={instructorLinks}>
        <div className="p-8 animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3" />
          <div className="grid grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-2xl" />)}</div>
        </div>
      </DashboardSidebar>
    );
  }

  if (!data) {
    return (
      <DashboardSidebar links={instructorLinks}>
        <div className="p-8 text-center text-slate-500">{t('لا توجد بيانات', 'No data available')}</div>
      </DashboardSidebar>
    );
  }

  const { course, stats, students, trends } = data;

  return (
    <DashboardSidebar links={instructorLinks}>
      <div className="p-8 max-w-5xl" id="stats-content">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-700 mb-2 flex items-center gap-1">
              ← {t('رجوع', 'Back')}
            </button>
            <h1 className="text-2xl font-bold text-slate-900">{t('إحصائيات الكورس', 'Course Statistics')}</h1>
            <p className="text-slate-500 text-sm mt-1">{course.title}</p>
          </div>
          <button
            onClick={exportStudentsPdf}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            📥 {t('تصدير PDF', 'Export PDF')}
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {[
            { label: t('إجمالي المشتركين', 'Total Enrollments'), value: stats.totalEnrollments, icon: '👥', color: 'bg-blue-50 text-blue-700' },
            { label: t('متوسط التقدم', 'Avg Progress'), value: `${stats.avgProgress}%`, icon: '📈', color: 'bg-green-50 text-green-700' },
            { label: t('إجمالي الإيرادات', 'Total Revenue'), value: formatPrice(stats.totalRevenue), icon: '💰', color: 'bg-yellow-50 text-yellow-700' },
            { label: t('المدفوعات الناجحة', 'Successful Payments'), value: stats.paidPaymentsCount, icon: '✅', color: 'bg-emerald-50 text-emerald-700' },
            { label: t('الاختبارات', 'Exams'), value: stats.totalExams, icon: '📝', color: 'bg-purple-50 text-purple-700' },
            { label: t('إجمالي المحاولات', 'Total Attempts'), value: stats.totalExamAttempts, icon: '🎯', color: 'bg-orange-50 text-orange-700' },
          ].map((card, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <div className={`inline-flex text-2xl p-2 rounded-xl mb-3 ${card.color}`}>{card.icon}</div>
              <div className="text-2xl font-bold text-slate-900">{card.value}</div>
              <div className="text-sm text-slate-500 mt-1">{card.label}</div>
            </div>
          ))}
        </div>

        {/* Trend charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('الاشتراكات الشهرية', 'Monthly Enrollments')}</h3>
            <MiniLineChart data={trends.enrollments.map((d: any) => ({ label: d.label, value: d.enrollments }))} stroke="#3b82f6" />
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('المدفوعات الشهرية', 'Monthly Payments')}</h3>
            <MiniBarChart data={trends.payments.map((d: any) => ({ label: d.label, value: d.payments }))} color="bg-purple-500" />
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('الإيرادات الشهرية (ج.م)', 'Monthly Revenue (EGP)')}</h3>
            <MiniLineChart data={trends.revenue.map((d: any) => ({ label: d.label, value: d.revenue }))} stroke="#10b981" />
          </div>
        </div>

        {/* Students table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">{t('قائمة الطلاب', 'Students List')}</h3>
            <span className="text-sm text-slate-500">{students.length} {t('طالب', 'students')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500">#</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500">{t('الاسم', 'Name')}</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500">{t('البريد', 'Email')}</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500">{t('التقدم', 'Progress')}</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500">{t('تاريخ التسجيل', 'Enrollment Date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-slate-400">{t('لا يوجد طلاب مشتركون بعد', 'No enrolled students yet')}</td></tr>
                ) : students.map((s: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-6 py-3 font-medium text-slate-800">{s.name || '—'}</td>
                    <td className="px-6 py-3 text-slate-500">{s.email}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-slate-200 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${s.progress}%` }} />
                        </div>
                        <span className="text-xs text-slate-600">{s.progress}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-slate-500">{new Date(s.enrolledAt).toLocaleDateString('ar-EG')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardSidebar>
  );
}
