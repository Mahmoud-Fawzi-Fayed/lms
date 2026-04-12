'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import { formatPrice } from '@/lib/utils';

const adminLinks = [
  { href: '/dashboard/admin', label: 'لوحة التحكم', icon: '📊' },
  { href: '/dashboard/admin/users', label: 'المستخدمين', icon: '👥' },
  { href: '/dashboard/admin/courses', label: 'الكورسات', icon: '📚' },
  { href: '/dashboard/admin/payments', label: 'المدفوعات', icon: '💳' },
];

export default function AdminPaymentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status]);
  useEffect(() => { if (status === 'authenticated' && (session?.user as any)?.role !== 'admin') router.push('/dashboard'); }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') fetchPayments();
  }, [statusFilter, status]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '100');
      const res = await fetch(`/api/admin/payments?${params.toString()}`);
      const data = await res.json();
      if (data.success) setPayments(data.data.payments || []);
    } catch (error) {
      console.error('Failed to fetch payments');
    } finally {
      setLoading(false);
    }
  };

  const statusColors: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-700',
    refunded: 'bg-gray-100 text-gray-700',
  };

  const statusLabel: Record<string, string> = {
    paid: 'مدفوع',
    pending: 'معلق',
    failed: 'فاشل',
    refunded: 'مسترد',
  };

  const methodLabel: Record<string, string> = {
    card: 'بطاقة',
    wallet: 'محفظة',
    fawry: 'فوري',
  };

  return (
    <DashboardSidebar links={adminLinks}>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">المدفوعات</h1>

        <div className="flex gap-4 mb-6">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">كل الحالات</option>
            <option value="paid">مدفوع</option>
            <option value="pending">معلق</option>
            <option value="failed">فاشل</option>
            <option value="refunded">مسترد</option>
          </select>

          <button
            onClick={fetchPayments}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            تحديث
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-right">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">المستخدم</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">العنصر</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">المبلغ</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">الطريقة</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">الحالة</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">تحقق Paymob</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : payments.length > 0 ? (
                  payments.map((payment) => (
                    <tr key={payment._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-sm text-slate-900">{payment.user?.name || '-'}</div>
                        <div className="text-xs text-slate-500">{payment.user?.email}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        <div className="font-medium">{payment.itemTitle}</div>
                        <div className="text-xs text-slate-400">
                          {payment.itemType === 'course' ? 'كورس' : payment.itemType === 'exam' ? 'اختبار' : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                        {formatPrice(payment.amount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{methodLabel[payment.method] || payment.method}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          statusColors[payment.status] || 'bg-gray-100 text-gray-700'
                        }`}>
                          {statusLabel[payment.status] || payment.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        <div>Order: {payment.paymobOrderId || '-'}</div>
                        <div>Txn: {payment.paymobTransactionId || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {new Date(payment.createdAt).toLocaleDateString('ar-EG')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">لا توجد مدفوعات</td>
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
