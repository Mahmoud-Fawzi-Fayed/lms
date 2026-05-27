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

export default function AdminExamStatsPage() {
  const { data: session, status } = useSession();
  useLang();
  const adminLinks = [
    { href: '/dashboard/admin', label: t('لوحة التحكم', 'Dashboard'), icon: '📊' },
    { href: '/dashboard/admin/users', label: t('المستخدمين', 'Users'), icon: '👥' },
    { href: '/dashboard/admin/courses', label: t('الكورسات', 'Courses'), icon: '📚' },
    { href: '/dashboard/admin/payments', label: t('المدفوعات', 'Payments'), icon: '💳' },
  ];
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && (session?.user as any)?.role !== 'admin') router.push('/dashboard');
  }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated' && params?.id) fetchStats();
  }, [status, params?.id]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stats/exams/${params.id}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  };

  const exportTopPdf = async () => {
    const rows = data?.topResults || [];
    await exportToPdf(
      `exam-${params.id}-top-results.pdf`,
      `${t('إحصائيات نتائج الاختبار:', 'Exam Results Stats:')} ${data?.exam?.title || ''}`,
      rows,
      [
        { header: t('الاسم', 'Name'), value: (r: any) => r.name },
        { header: t('البريد', 'Email'), value: (r: any) => r.email },
        { header: t('أفضل درجة', 'Best Score'), value: (r: any) => `${r.bestScore}%` },
        { header: t('أسرع وقت (د)', 'Fastest Time (m)'), value: (r: any) => Math.round((r.fastestTime || 0) / 60) },
        { header: t('عدد المحاولات', 'Attempts'), value: (r: any) => r.attempts },
      ]
    );
  };

  return (
    <DashboardSidebar links={adminLinks}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('إحصائيات الاختبار', 'Exam Statistics')}</h1>
            {data?.exam && <p className="text-slate-500 mt-1">{data.exam.title}</p>}
          </div>
          <button
            onClick={exportTopPdf}
            disabled={!data}
            className="px-4 py-2 bg-white border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 text-sm disabled:opacity-50"
          >
            {t('تصدير النتائج PDF', 'Export Results PDF')}
          </button>
        </div>

        {loading ? (
          <div className="text-slate-500">{t('جاري التحميل...', 'Loading...')}</div>
        ) : !data ? (
          <div className="text-slate-500">{t('تعذر تحميل الإحصائيات', 'Failed to load statistics')}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-8 gap-6 mb-8">
              <Card title={t('المحاولات', 'Attempts')} value={data.stats.attempts} />
              <Card title={t('المشاركون', 'Participants')} value={data.stats.uniqueParticipants} />
              <Card title={t('متوسط الدرجة', 'Avg Score')} value={`${data.stats.avgScore}%`} />
              <Card title={t('معدل النجاح', 'Pass Rate')} value={`${data.stats.passRate}%`} />
              <Card title={t('متوسط الوقت', 'Avg Time')} value={`${data.stats.avgTimeMinutes} ${t('د', 'm')}`} />
              <Card title={t('اشتراكات الاختبار', 'Exam Enrollments')} value={data.stats.enrollmentCount} />
              <Card title={t('مدفوعات ناجحة', 'Successful Payments')} value={data.stats.paidPaymentsCount} />
              <Card title={t('إيراد', 'Revenue')} value={formatPrice(data.stats.totalRevenue)} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
              <Panel title={t('اتجاه المحاولات', 'Attempts Trend')}>
                <MiniLineChart data={data.trends.attempts} />
              </Panel>
              <Panel title={t('اتجاه المدفوعات', 'Payment Trend')}>
                <MiniLineChart data={data.trends.payments} stroke="#14b8a6" />
              </Panel>
              <Panel title={t('اتجاه الإيراد', 'Revenue Trend')}>
                <MiniBarChart data={data.trends.revenue} color="bg-emerald-500" />
              </Panel>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
              <h2 className="font-semibold text-slate-900 mb-4">{t('أفضل النتائج', 'Top Results')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="text-right bg-accent-50 text-xs text-accent-500">
                      <th className="px-4 py-3">{t('الطالب', 'Student')}</th>
                      <th className="px-4 py-3">{t('البريد', 'Email')}</th>
                      <th className="px-4 py-3">{t('أفضل درجة', 'Best Score')}</th>
                      <th className="px-4 py-3">{t('أسرع وقت', 'Fastest Time')}</th>
                      <th className="px-4 py-3">{t('عدد المحاولات', 'Attempts')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-accent-100">
                    {data.topResults.map((row: any) => (
                      <tr key={row.userId} className="text-sm">
                        <td className="px-4 py-3 font-medium text-accent-900">{row.name}</td>
                        <td className="px-4 py-3 text-accent-700">{row.email}</td>
                        <td className="px-4 py-3 text-accent-700">{row.bestScore}%</td>
                        <td className="px-4 py-3 text-accent-700">{Math.round((row.fastestTime || 0) / 60)} {t('د', 'm')}</td>
                        <td className="px-4 py-3 text-accent-700">{row.attempts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardSidebar>
  );
}

function Card({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <div className="text-sm text-slate-500 mb-1">{title}</div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <h2 className="font-semibold text-slate-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}
