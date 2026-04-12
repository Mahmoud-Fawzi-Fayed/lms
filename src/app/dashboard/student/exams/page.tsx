'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import Link from 'next/link';

const studentLinks = [
  { href: '/dashboard/student', label: 'لوحة التحكم', icon: '📊' },
  { href: '/dashboard/student/courses', label: 'كورساتي', icon: '📚' },
  { href: '/dashboard/student/exams', label: 'اختباراتي', icon: '📝' },
  { href: '/dashboard/student/profile', label: 'الملف الشخصي', icon: '👤' },
];

export default function StudentExamsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status]);
  useEffect(() => { if (status === 'authenticated' && (session?.user as any)?.role !== 'student' && (session?.user as any)?.role !== 'admin') router.push('/dashboard'); }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') fetchAttempts();
  }, [status]);

  const fetchAttempts = async () => {
    try {
      const res = await fetch('/api/exams?myAttempts=true');
      const data = await res.json();
      if (data.success) setAttempts(data.data.attempts || []);
    } catch (error) {
      console.error('Failed to fetch attempts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardSidebar links={studentLinks}>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">اختباراتي</h1>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
                <div className="h-4 bg-slate-200 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : attempts.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-right">
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500">الاختبار</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500">الكورس</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500">الدرجة</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500">النتيجة</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500">التاريخ</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attempts.map((attempt) => (
                    <tr key={attempt._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{attempt.exam?.title}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{attempt.course?.title}</td>
                      <td className="px-6 py-4">
                        <span className="text-lg font-bold text-slate-900">{attempt.score}%</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          attempt.passed
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {attempt.passed ? 'ناجح' : 'راسب'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {new Date(attempt.submittedAt || attempt.startedAt).toLocaleDateString('ar-EG')}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/exams/${attempt.exam?._id}/leaderboard`}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          المتصدرين
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
            <span className="text-5xl mb-4 block">📝</span>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">لا توجد محاولات اختبار بعد</h3>
            <p className="text-slate-500">ابدأ اختبار من الكورسات المسجلة</p>
          </div>
        )}
      </div>
    </DashboardSidebar>
  );
}
