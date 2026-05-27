'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';

export default function AdminCoursesPage() {
  useLang();
  const { data: session, status } = useSession();
  const adminLinks = [
    { href: '/dashboard/admin', label: t('لوحة التحكم', 'Dashboard'), icon: '📊' },
    { href: '/dashboard/admin/users', label: t('المستخدمين', 'Users'), icon: '👥' },
    { href: '/dashboard/admin/courses', label: t('الكورسات', 'Courses'), icon: '📚' },
    { href: '/dashboard/admin/payments', label: t('المدفوعات', 'Payments'), icon: '💳' },
  ];
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
    } catch {
      toast.error(t('فشل تحميل الكورسات', 'Failed to load courses'));
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
      if (res.ok) { fetchCourses(); toast.success(t('تم تحديث الحالة', 'Status updated')); }
      else { const d = await res.json(); toast.error(d.error || t('فشل التحديث', 'Update failed')); }
    } catch {
      toast.error(t('خطأ في الاتصال', 'Network error'));
    }
  };

  const deleteCourse = async (courseId: string) => {
    if (!confirm(t('هل أنت متأكد من حذف هذا الكورس؟', 'Are you sure you want to delete this course?'))) return;
    try {
      const res = await fetch(`/api/courses/${courseId}`, { method: 'DELETE' });
      if (res.ok) { fetchCourses(); toast.success(t('تم حذف الكورس', 'Course deleted')); }
      else { const d = await res.json(); toast.error(d.error || t('فشل الحذف', 'Delete failed')); }
    } catch {
      toast.error(t('خطأ في الحذف', 'Delete error'));
    }
  };

  return (
    <DashboardSidebar links={adminLinks}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-slate-900">{t('كل الكورسات', 'All Courses')}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-right">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('الكورس', 'Course')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('المحاضر', 'Instructor')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('السعر', 'Price')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('المسجلين', 'Enrollments')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('الحالة', 'Status')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('إجراءات', 'Actions')}</th>
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
                        {course.instructor?.name || t('غير معروف', 'Unknown')}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {course.price === 0 ? t('مجاني', 'Free') : `${course.price} ${t('ج.م', 'EGP')}`}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{course.enrollmentCount || 0}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          course.isPublished ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {course.isPublished ? t('منشور', 'Published') : t('مسودة', 'Draft')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/admin/courses/${course._id}/stats`}
                            className="text-sm text-emerald-600 hover:text-emerald-800 font-medium"
                          >
                            {t('إحصائيات', 'Stats')}
                          </Link>
                          <button
                            onClick={() => togglePublish(course._id, course.isPublished)}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {course.isPublished ? t('إلغاء النشر', 'Unpublish') : t('نشر', 'Publish')}
                          </button>
                          <button
                            onClick={() => deleteCourse(course._id)}
                            className="text-sm text-red-600 hover:text-red-800 font-medium"
                          >
                            {t('حذف', 'Delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">{t('لا توجد كورسات', 'No courses found')}</td>
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
