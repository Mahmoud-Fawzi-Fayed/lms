'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import { formatPrice } from '@/lib/utils';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';

export default function AdminPaymentsPage() {
  useLang();
  const { data: session, status } = useSession();
  const adminLinks = [
    { href: '/dashboard/admin', label: t('لوحة التحكم', 'Dashboard'), icon: '📊' },
    { href: '/dashboard/admin/users', label: t('المستخدمين', 'Users'), icon: '👥' },
    { href: '/dashboard/admin/courses', label: t('الكورسات', 'Courses'), icon: '📚' },
    { href: '/dashboard/admin/payments', label: t('المدفوعات', 'Payments'), icon: '💳' },
  ];
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
    } catch {
      toast.error(t('فشل تحميل المدفوعات', 'Failed to load payments'));
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
    paid: t('مدفوع', 'Paid'),
    pending: t('معلق', 'Pending'),
    failed: t('فاشل', 'Failed'),
    refunded: t('مسترد', 'Refunded'),
  };

  const methodLabel: Record<string, string> = {
    card: t('بطاقة', 'Card'),
    wallet: t('محفظة', 'Wallet'),
    fawry: t('فوري', 'Fawry'),
  };

  return (
    <DashboardSidebar links={adminLinks}>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">{t('المدفوعات', 'Payments')}</h1>

        <div className="flex gap-4 mb-6">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">{t('كل الحالات', 'All Statuses')}</option>
            <option value="paid">{t('مدفوع', 'Paid')}</option>
            <option value="pending">{t('معلق', 'Pending')}</option>
            <option value="failed">{t('فاشل', 'Failed')}</option>
            <option value="refunded">{t('مسترد', 'Refunded')}</option>
          </select>

          <button
            onClick={fetchPayments}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            {t('تحديث', 'Refresh')}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-right">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('المستخدم', 'User')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('العنصر', 'Item')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('المبلغ', 'Amount')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('الطريقة', 'Method')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('الحالة', 'Status')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('تحقق Paymob', 'Paymob Verify')}</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">{t('التاريخ', 'Date')}</th>
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
                          {payment.itemType === 'course' ? t('كورس', 'Course') : payment.itemType === 'exam' ? t('اختبار', 'Exam') : '-'}
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
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">{t('لا توجد مدفوعات', 'No payments found')}</td>
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
