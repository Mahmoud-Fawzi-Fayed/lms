'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';

export default function AdminUsersPage() {
  useLang();
  const { data: session, status } = useSession();
  const adminLinks = [
    { href: '/dashboard/admin', label: t('لوحة التحكم', 'Dashboard'), icon: '📊' },
    { href: '/dashboard/admin/users', label: t('المستخدمين', 'Users'), icon: '👥' },
    { href: '/dashboard/admin/courses', label: t('الكورسات', 'Courses'), icon: '📚' },
    { href: '/dashboard/admin/payments', label: t('المدفوعات', 'Payments'), icon: '💳' },
  ];
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status]);
  useEffect(() => { if (status === 'authenticated' && (session?.user as any)?.role !== 'admin') router.push('/dashboard'); }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') fetchUsers();
  }, [page, roleFilter, search, status]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.data.users);
        setTotalPages(data.data.pagination?.pages || 1);
      }
    } catch {
      toast.error(t('فشل تحميل المستخدمين', 'Failed to load users'));
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userId: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isActive: !isActive }),
      });
      if (res.ok) { fetchUsers(); }
      else { const d = await res.json(); toast.error(d.error || t('فشل تحديث الحالة', 'Failed to update status')); }
    } catch {
      toast.error(t('خطأ في الاتصال', 'Network error'));
    }
  };

  const updateRole = async (userId: string, role: string) => {
    try {
      const res = await fetch(`/api/admin/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      if (res.ok) { fetchUsers(); toast.success(t('تم تحديث الدور', 'Role updated')); }
      else { const d = await res.json(); toast.error(d.error || t('فشل تحديث الدور', 'Failed to update role')); }
    } catch {
      toast.error(t('خطأ في الاتصال', 'Network error'));
    }
  };

  return (
    <DashboardSidebar links={adminLinks}>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">{t('إدارة المستخدمين', 'User Management')}</h1>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <input
            type="text"
            placeholder={t('ابحث بالاسم أو البريد الإلكتروني...', 'Search by name or email...')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">{t('كل الأدوار', 'All Roles')}</option>
            <option value="student">{t('طلاب', 'Students')}</option>
            <option value="instructor">{t('محاضرين', 'Instructors')}</option>
            <option value="admin">{t('مسؤولين', 'Admins')}</option>
          </select>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-right">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('المستخدم', 'User')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('الدور', 'Role')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('الحالة', 'Status')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('تاريخ الانضمام', 'Join Date')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('إجراءات', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-40" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-24" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                    </tr>
                  ))
                ) : users.length > 0 ? (
                  users.map((user) => (
                    <tr key={user._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-slate-900">{user.name}</div>
                          <div className="text-sm text-slate-500">{user.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={user.role}
                          onChange={(e) => updateRole(user._id, e.target.value)}
                          className="text-sm border border-slate-200 rounded-lg px-2 py-1"
                        >
                          <option value="student">{t('طالب', 'Student')}</option>
                          <option value="instructor">{t('محاضر', 'Instructor')}</option>
                          <option value="admin">{t('مسؤول', 'Admin')}</option>
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {user.isActive ? t('نشط', 'Active') : t('موقوف', 'Suspended')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {new Date(user.createdAt).toLocaleDateString('ar-EG')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {user.role === 'student' && (
                            <Link
                              href={`/dashboard/admin/students/${user._id}/stats`}
                              className="text-sm font-medium text-emerald-600 hover:text-emerald-800"
                            >
                              {t('إحصائيات', 'Stats')}
                            </Link>
                          )}
                          <button
                            onClick={() => toggleUserStatus(user._id, user.isActive)}
                            className={`text-sm font-medium ${
                              user.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'
                            }`}
                          >
                            {user.isActive ? t('إيقاف', 'Deactivate') : t('تفعيل', 'Activate')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      {t('لا يوجد مستخدمين', 'No users found')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className={`w-10 h-10 rounded-xl text-sm font-medium transition-colors ${
                  page === i + 1
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border text-gray-600 hover:bg-gray-50'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </DashboardSidebar>
  );
}
