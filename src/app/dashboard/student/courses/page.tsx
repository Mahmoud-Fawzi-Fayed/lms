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

export default function StudentCoursesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status]);
  useEffect(() => { if (status === 'authenticated' && (session?.user as any)?.role !== 'student' && (session?.user as any)?.role !== 'admin') router.push('/dashboard'); }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') fetchEnrollments();
  }, [status]);

  const fetchEnrollments = async () => {
    try {
      const res = await fetch('/api/enrollments');
      const data = await res.json();
      if (data.success) setEnrollments(data.data.enrollments || []);
    } catch (error) {
      console.error('Failed to fetch enrollments');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardSidebar links={studentLinks}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-slate-900">كورساتي</h1>
          <Link
            href="/courses"
            className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            تصفح المزيد
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 animate-pulse">
                <div className="h-40 bg-slate-200 rounded-xl mb-4" />
                <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-slate-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : enrollments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {enrollments.map((enrollment) => (
              <Link
                key={enrollment._id}
                href={`/courses/learn/${enrollment.course?._id}`}
                className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="h-40 bg-gradient-to-bl from-blue-400 to-purple-500 flex items-center justify-center relative">
                  <span className="text-5xl">📚</span>
                  {enrollment.progress?.percentage === 100 && (
                    <div className="absolute top-3 left-3 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                      ✓ مكتمل
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-slate-900 mb-1 line-clamp-2">{enrollment.course?.title}</h3>
                  <p className="text-sm text-slate-500 mb-3">
                    {enrollment.course?.instructor?.name || 'غير معروف'}
                  </p>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>التقدم</span>
                      <span className="font-semibold">{enrollment.progress?.percentage || 0}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${enrollment.progress?.percentage || 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 mt-3">
                    تاريخ التسجيل: {new Date(enrollment.enrolledAt).toLocaleDateString('ar-EG')}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
            <span className="text-5xl mb-4 block">📚</span>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">لا توجد كورسات بعد</h3>
            <p className="text-slate-500 mb-4">سجل في كورس لتبدأ التعلم</p>
            <Link
              href="/courses"
              className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              تصفح الكورسات
            </Link>
          </div>
        )}
      </div>
    </DashboardSidebar>
  );
}
