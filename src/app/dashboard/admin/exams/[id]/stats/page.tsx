'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import { MiniBarChart, MiniLineChart } from '@/components/analytics/Charts';
import { formatPrice } from '@/lib/utils';
import { exportToPdf } from '@/lib/export-utils';

const adminLinks = [
  { href: '/dashboard/admin', label: 'لوحة التحكم', icon: '📊' },
  { href: '/dashboard/admin/users', label: 'المستخدمين', icon: '👥' },
  { href: '/dashboard/admin/courses', label: 'الكورسات', icon: '📚' },
  { href: '/dashboard/admin/payments', label: 'المدفوعات', icon: '💳' },
];

export default function AdminExamStatsPage() {
  const { data: session, status } = useSession();
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
      `إحصائيات نتائج الاختبار: ${data?.exam?.title || ''}`,
      rows,
      [
        { header: 'الاسم', value: (r: any) => r.name },
        { header: 'البريد', value: (r: any) => r.email },
        { header: 'أفضل درجة', value: (r: any) => `${r.bestScore}%` },
        { header: 'أسرع وقت (د)', value: (r: any) => Math.round((r.fastestTime || 0) / 60) },
        { header: 'عدد المحاولات', value: (r: any) => r.attempts },
      ]
    );
  };

  return (
    <DashboardSidebar links={adminLinks}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">إحصائيات الاختبار</h1>
            {data?.exam && <p className="text-slate-500 mt-1">{data.exam.title}</p>}
          </div>
          <button
            onClick={exportTopPdf}
            disabled={!data}
            className="px-4 py-2 bg-white border border-accent-200 text-accent-700 rounded-lg hover:bg-accent-50 text-sm disabled:opacity-50"
          >
            تصدير النتائج PDF
          </button>
        </div>

        {loading ? (
          <div className="text-slate-500">جاري التحميل...</div>
        ) : !data ? (
          <div className="text-slate-500">تعذر تحميل الإحصائيات</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-8 gap-6 mb-8">
              <Card title="المحاولات" value={data.stats.attempts} />
              <Card title="المشاركون" value={data.stats.uniqueParticipants} />
              <Card title="متوسط الدرجة" value={`${data.stats.avgScore}%`} />
              <Card title="معدل النجاح" value={`${data.stats.passRate}%`} />
              <Card title="متوسط الوقت" value={`${data.stats.avgTimeMinutes} د`} />
              <Card title="اشتراكات الاختبار" value={data.stats.enrollmentCount} />
              <Card title="مدفوعات ناجحة" value={data.stats.paidPaymentsCount} />
              <Card title="إيراد" value={formatPrice(data.stats.totalRevenue)} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
              <Panel title="اتجاه المحاولات">
                <MiniLineChart data={data.trends.attempts} />
              </Panel>
              <Panel title="اتجاه المدفوعات">
                <MiniLineChart data={data.trends.payments} stroke="#14b8a6" />
              </Panel>
              <Panel title="اتجاه الإيراد">
                <MiniBarChart data={data.trends.revenue} color="bg-emerald-500" />
              </Panel>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
              <h2 className="font-semibold text-slate-900 mb-4">أفضل النتائج</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="text-right bg-accent-50 text-xs text-accent-500">
                      <th className="px-4 py-3">الطالب</th>
                      <th className="px-4 py-3">البريد</th>
                      <th className="px-4 py-3">أفضل درجة</th>
                      <th className="px-4 py-3">أسرع وقت</th>
                      <th className="px-4 py-3">عدد المحاولات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-accent-100">
                    {data.topResults.map((row: any) => (
                      <tr key={row.userId} className="text-sm">
                        <td className="px-4 py-3 font-medium text-accent-900">{row.name}</td>
                        <td className="px-4 py-3 text-accent-700">{row.email}</td>
                        <td className="px-4 py-3 text-accent-700">{row.bestScore}%</td>
                        <td className="px-4 py-3 text-accent-700">{Math.round((row.fastestTime || 0) / 60)} د</td>
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
