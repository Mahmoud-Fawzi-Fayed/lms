'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import Link from 'next/link';

const instructorLinks = [
  { href: '/dashboard/instructor', label: 'لوحة التحكم', icon: '📊' },
  { href: '/dashboard/instructor/courses', label: 'كورساتي', icon: '📚' },
  { href: '/dashboard/instructor/courses/new', label: 'إنشاء كورس', icon: '➕' },
  { href: '/dashboard/instructor/exams', label: 'الاختبارات', icon: '📝' },
];

export default function InstructorCoursesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status]);
  useEffect(() => { if (status === 'authenticated' && (session?.user as any)?.role !== 'instructor' && (session?.user as any)?.role !== 'admin') router.push('/dashboard'); }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') fetchCourses();
  }, [status]);

  const fetchCourses = async () => {
    try {
      const res = await fetch('/api/instructor/stats');
      const data = await res.json();
      if (data.success) setCourses(data.data.courses || []);
    } catch (error) {
      console.error('Failed to fetch courses');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardSidebar links={instructorLinks}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-slate-900">كورساتي</h1>
          <Link
            href="/dashboard/instructor/courses/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            + كورس جديد
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 animate-pulse">
                <div className="h-40 bg-gray-200 rounded-xl mb-4" />
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : courses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <div key={course._id} className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                <div className="h-40 bg-gradient-to-bl from-blue-400 to-purple-500 flex items-center justify-center">
                  <span className="text-5xl">📚</span>
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-slate-900 mb-1 line-clamp-1">{course.title}</h3>
                  <div className="flex items-center gap-3 text-sm text-slate-500 mb-3">
                    <span>{course.modules?.length || 0} وحدة</span>
                    <span>·</span>
                    <span>{course.enrollmentCount || 0} طالب</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      course.isPublished ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {course.isPublished ? 'منشور' : 'مسودة'}
                    </span>
                    <Link
                      href={`/dashboard/instructor/courses/${course._id}`}
                      className="text-sm text-blue-600 font-medium hover:underline"
                    >
                      تعديل ←
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border">
            <span className="text-5xl mb-4 block">📚</span>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">لا توجد كورسات بعد</h3>
            <p className="text-slate-500 mb-4">أنشئ أول كورس للبدء</p>
            <Link
              href="/dashboard/instructor/courses/new"
              className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              إنشاء كورس
            </Link>
          </div>
        )}
      </div>
    </DashboardSidebar>
  );
}
