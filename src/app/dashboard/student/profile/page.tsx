'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';

const studentLinks = [
  { href: '/dashboard/student', label: 'لوحة التحكم', icon: '📊' },
  { href: '/dashboard/student/courses', label: 'كورساتي', icon: '📚' },
  { href: '/dashboard/student/exams', label: 'اختباراتي', icon: '📝' },
  { href: '/dashboard/student/profile', label: 'الملف الشخصي', icon: '👤' },
];

export default function StudentProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [message, setMessage] = useState('');

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status]);
  useEffect(() => { if (status === 'authenticated' && (session?.user as any)?.role !== 'student' && (session?.user as any)?.role !== 'admin') router.push('/dashboard'); }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') fetchProfile();
  }, [status]);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/users/me');
      const data = await res.json();
      if (data.success) {
        setUser(data.data);
        setForm({ name: data.data.name, phone: data.data.phone || '' });
      }
    } catch (error) {
      console.error('Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('تم تحديث الملف الشخصي بنجاح!');
        fetchProfile();
      } else {
        setMessage(data.error || 'فشل التحديث');
      }
    } catch {
      setMessage('حدث خطأ ما');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardSidebar links={studentLinks}>
      <div className="p-8 w-full max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">الملف الشخصي</h1>

        {loading ? (
          <div className="bg-white rounded-2xl p-6 animate-pulse space-y-4">
            <div className="h-4 bg-slate-200 rounded w-1/3" />
            <div className="h-10 bg-slate-200 rounded" />
            <div className="h-4 bg-slate-200 rounded w-1/3" />
            <div className="h-10 bg-slate-200 rounded" />
          </div>
        ) : user ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-2xl">
                {user.name?.charAt(0)?.toUpperCase() || '👤'}
              </div>
              <div>
                <div className="font-semibold text-slate-900">{user.name}</div>
                <div className="text-sm text-slate-500">{user.email}</div>
                <div className="text-xs text-slate-400 capitalize mt-1">
                  {user.role === 'student' ? 'طالب' : user.role === 'instructor' ? 'محاضر' : 'مسؤول'} · عضو منذ {new Date(user.createdAt).toLocaleDateString('ar-EG')}
                </div>
              </div>
            </div>

            <hr />

            {message && (
              <div className={`px-4 py-3 rounded-xl text-sm ${
                message.includes('بنجاح') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {message}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">الاسم الكامل</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">البريد الإلكتروني</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 cursor-not-allowed"
              />
              <p className="text-xs text-slate-400 mt-1">لا يمكن تغيير البريد الإلكتروني</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">الهاتف</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+20XXXXXXXXXX"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardSidebar>
  );
}
