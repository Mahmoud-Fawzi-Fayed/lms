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

export default function StudentDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && (session?.user as any)?.role !== 'student' && (session?.user as any)?.role !== 'admin') router.push('/dashboard');
  }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') fetchData();
  }, [status]);

  const fetchData = async () => {
    try {
      const [enrollRes, userRes] = await Promise.all([
        fetch('/api/enrollments'),
        fetch('/api/users/me'),
      ]);
      const enrollData = await enrollRes.json();
      const userData = await userRes.json();
      setData({
        enrollments: enrollData.success ? (enrollData.data.enrollments || []) : [],
        user: userData.success ? userData.data : null,
      });
    } catch (error) {
      console.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const activeEnrollments = data?.enrollments?.filter((e: any) => e.status === 'active') || [];

  return (
    <DashboardSidebar links={studentLinks}>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          مرحباً بك{data?.user?.name ? `، ${data.user.name}` : ''} 👋
        </h1>
        <p className="text-slate-500 mb-8">أكمل رحلة التعلم</p>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-24 mb-4" />
                <div className="h-8 bg-slate-200 rounded w-16" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">الكورسات المسجلة</span>
                  <span className="text-2xl">📚</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{activeEnrollments.length}</div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">متوسط التقدم</span>
                  <span className="text-2xl">📈</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {activeEnrollments.length > 0
                    ? Math.round(
                        activeEnrollments.reduce((sum: number, e: any) => sum + (e.progress?.percentage || 0), 0) /
                          activeEnrollments.length
                      )
                    : 0}%
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-600">مكتمل</span>
                  <span className="text-2xl">🏆</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {activeEnrollments.filter((e: any) => e.progress?.percentage === 100).length}
                </div>
              </div>
            </div>

            {/* Continue Learning */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
              <h2 className="font-semibold text-slate-900 mb-4">أكمل التعلم</h2>
              {activeEnrollments.length > 0 ? (
                <div className="space-y-3">
                  {activeEnrollments.slice(0, 5).map((enrollment: any) => (
                    <Link
                      key={enrollment._id}
                      href={`/courses/learn/${enrollment.course?._id}`}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{enrollment.course?.title}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {enrollment.course?.instructor?.name || 'محاضر غير معروف'}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-32">
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span>التقدم</span>
                            <span>{enrollment.progress?.percentage || 0}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${enrollment.progress?.percentage || 0}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-slate-400">←</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-500 mb-4">لا توجد كورسات بعد</p>
                  <Link
                    href="/courses"
                    className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
                  >
                    تصفح الكورسات
                  </Link>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Link
                href="/courses"
                className="bg-gradient-to-l from-blue-500 to-blue-600 rounded-2xl p-6 text-white hover:shadow-lg transition-shadow"
              >
                <span className="text-3xl mb-2 block">🔍</span>
                <h3 className="font-semibold text-lg">تصفح الكورسات</h3>
                <p className="text-blue-100 text-sm mt-1">اكتشف كورسات جديدة للتعلم</p>
              </Link>
              <Link
                href="/dashboard/student/exams"
                className="bg-gradient-to-l from-purple-500 to-purple-600 rounded-2xl p-6 text-white hover:shadow-lg transition-shadow"
              >
                <span className="text-3xl mb-2 block">📝</span>
                <h3 className="font-semibold text-lg">اختباراتي</h3>
                <p className="text-purple-100 text-sm mt-1">شاهد نتائج اختباراتك ودرجاتك</p>
              </Link>
            </div>
          </>
        )}
      </div>
    </DashboardSidebar>
  );
}
