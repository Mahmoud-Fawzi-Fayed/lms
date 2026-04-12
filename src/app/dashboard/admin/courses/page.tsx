'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import Link from 'next/link';

const adminLinks = [
  { href: '/dashboard/admin', label: 'لوحة التحكم', icon: '📊' },
  { href: '/dashboard/admin/users', label: 'المستخدمين', icon: '👥' },
  { href: '/dashboard/admin/courses', label: 'الكورسات', icon: '📚' },
  { href: '/dashboard/admin/payments', label: 'المدفوعات', icon: '💳' },
];

export default function AdminCoursesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status]);
  useEffect(() => { if (status === 'authenticated' && (session?.user as any)?.role !== 'admin') router.push('/dashboard'); }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') fetchCourses();
  }, [status]);

  const fetchCourses = async () => {
    try {
      const res = await fetch('/api/admin/courses?limit=100');
      const data = await res.json();
      if (data.success) setCourses(data.data.courses);
    } catch (error) {
      console.error('Failed to fetch courses');
    } finally {
      setLoading(false);
    }
  };

  const togglePublish = async (courseId: string, isPublished: boolean) => {
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !isPublished }),
      });
      if (res.ok) fetchCourses();
    } catch (error) {
      console.error('Failed to update course');
    }
  };

  const deleteCourse = async (courseId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الكورس؟')) return;
    try {
      const res = await fetch(`/api/courses/${courseId}`, { method: 'DELETE' });
      if (res.ok) fetchCourses();
    } catch (error) {
      console.error('Failed to delete course');
    }
  };

  return (
    <DashboardSidebar links={adminLinks}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-slate-900">كل الكورسات</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-right">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">الكورس</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">المحاضر</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">السعر</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">المسجلين</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">الحالة</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : courses.length > 0 ? (
                  courses.map((course) => (
                    <tr key={course._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900 max-w-[200px] truncate">{course.title}</div>
                        <div className="text-xs text-slate-500">{course.category} · {course.level}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {course.instructor?.name || 'غير معروف'}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {course.price === 0 ? 'مجاني' : `${course.price} ج.م`}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{course.enrollmentCount || 0}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          course.isPublished ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {course.isPublished ? 'منشور' : 'مسودة'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/admin/courses/${course._id}/stats`}
                            className="text-sm text-emerald-600 hover:text-emerald-800 font-medium"
                          >
                            إحصائيات
                          </Link>
                          <button
                            onClick={() => togglePublish(course._id, course.isPublished)}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {course.isPublished ? 'إلغاء النشر' : 'نشر'}
                          </button>
                          <button
                            onClick={() => deleteCourse(course._id)}
                            className="text-sm text-red-600 hover:text-red-800 font-medium"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">لا توجد كورسات</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardSidebar>
  );
}
