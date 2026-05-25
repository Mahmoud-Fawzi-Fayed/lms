'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { signIn } from 'next-auth/react';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';
import { ACADEMIC_YEARS, academicYearLabel } from '@/lib/validations';

export default function RegisterPage() {
  useLang();
  const router = useRouter();
  const [step, setStep] = useState<'year' | 'form'>('year');
  const [selectedYear, setSelectedYear] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error(t('كلمات المرور غير متطابقة', 'Passwords do not match'));
      return;
    }

    if (formData.password.length < 8) {
      toast.error(t('كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'Password must be at least 8 characters'));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone,
          academicYear: selectedYear,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || t('فشل إنشاء الحساب', 'Account creation failed'));
        return;
      }

      toast.success(t('تم إنشاء الحساب! جاري تسجيل الدخول...', 'Account created! Signing you in...'));

      const signInResult = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (signInResult?.ok) {
        router.push('/dashboard');
        router.refresh();
      } else {
        router.push('/login');
      }
    } catch (error) {
      toast.error(t('حدث خطأ. حاول مرة أخرى.', 'An error occurred. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const yearGroups = [
    {
      group: t('الابتدائي', 'Primary'),
      color: 'from-emerald-500 to-teal-500',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      ring: 'ring-emerald-400',
      text: 'text-emerald-700',
      years: ACADEMIC_YEARS.filter(y => y.value.includes('primary')),
    },
    {
      group: t('الإعدادي', 'Preparatory'),
      color: 'from-blue-500 to-indigo-500',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      ring: 'ring-blue-400',
      text: 'text-blue-700',
      years: ACADEMIC_YEARS.filter(y => y.value.includes('prep')),
    },
    {
      group: t('الثانوي', 'Secondary'),
      color: 'from-violet-500 to-purple-500',
      bg: 'bg-violet-50',
      border: 'border-violet-200',
      ring: 'ring-violet-400',
      text: 'text-violet-700',
      years: ACADEMIC_YEARS.filter(y => y.value.includes('secondary')),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-50 to-primary-50 flex flex-col items-center justify-center p-4">
      <Link href="/" className="flex items-center gap-2.5 mb-10">
        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-soft">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
            <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
          </svg>
        </div>
        <span className="font-bold text-base text-accent-800">
          {t('أ/', 'Mr.')}<span className="text-primary-500"> {t('محمد الصباغ', 'Mohamed Elsabbagh')}</span>
        </span>
      </Link>

      {step === 'year' && (
        <div className="w-full max-w-2xl bg-white rounded-xl shadow-soft border border-accent-200 p-8">
          <h1 className="text-3xl font-bold text-accent-900 mb-2 text-center">
            {t('اختر سنتك الدراسية', 'Choose your academic year')}
          </h1>
          <p className="text-accent-600 text-center mb-10 text-lg">
            {t('ستظهر لك الكورسات المناسبة لمستواك', 'Courses matching your level will be shown')}
          </p>

          <div className="space-y-6">
            {yearGroups.map(({ group, color, bg, border, ring, text, years }) => (
              <div key={group}>
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3 ${bg} ${text}`}>
                  <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${color}`} />
                  {group}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {years.map(y => (
                    <button
                      key={y.value}
                      type="button"
                      onClick={() => setSelectedYear(y.value)}
                      className={`relative flex flex-col items-center justify-center py-4 px-3 rounded-2xl border-2 transition-all font-semibold text-sm
                        ${selectedYear === y.value
                          ? `${bg} ${border} ring-2 ${ring} ring-offset-1 ${text} shadow-md`
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                      {selectedYear === y.value && (
                        <span className={`absolute top-2 left-2 w-5 h-5 rounded-full bg-gradient-to-br ${color} flex items-center justify-center`}>
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                      {academicYearLabel(y.value)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={!selectedYear}
            onClick={() => setStep('form')}
            className="w-full mt-10 py-3 bg-primary-500 hover:bg-primary-600 text-white font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-soft"
          >
            {t('التالي → إنشاء الحساب', 'Next → Create account')}
          </button>

          <p className="text-center text-accent-600 mt-6 text-sm">
            {t('لديك حساب بالفعل؟', 'Already have an account?')}{' '}
            <Link href="/login" className="text-primary-600 font-semibold hover:text-primary-700">
              {t('سجّل دخولك', 'Sign in')}
            </Link>
          </p>
        </div>
      )}

      {step === 'form' && (
        <div className="w-full max-w-md bg-white rounded-xl shadow-soft border border-accent-200 p-8">
          <button
            type="button"
            onClick={() => setStep('year')}
            className="flex items-center gap-2 mb-8 text-sm text-primary-600 hover:text-primary-700 font-semibold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('تغيير السنة الدراسية', 'Change academic year')}
            <span className="ms-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs font-bold">
              {academicYearLabel(selectedYear)}
            </span>
          </button>

          <h1 className="text-3xl font-bold text-accent-900 mb-2">
            {t('إنشاء حساب', 'Create an account')}
          </h1>
          <p className="text-accent-600 mb-8">
            {t('ابدأ رحلتك التعليمية مع منصة أ/ محمد الصباغ', "Start your learning journey with Mr. Mohamed Elsabbagh's platform")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-accent-800 mb-2">{t('الاسم الكامل', 'Full name')}</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 border border-accent-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all bg-white"
                placeholder={t('أدخل اسمك', 'Enter your name')}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-accent-800 mb-2">{t('البريد الإلكتروني', 'Email')}</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-accent-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all bg-white"
                placeholder="example@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-accent-800 mb-2">{t('الهاتف (اختياري)', 'Phone (optional)')}</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-3 border border-accent-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all bg-white"
                placeholder="+20 1XX XXX XXXX"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-accent-800 mb-2">{t('كلمة المرور', 'Password')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-3 border border-accent-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all pe-12 bg-white"
                  placeholder={t('8 أحرف على الأقل', 'At least 8 characters')}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-400 hover:text-accent-600">
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <p className="text-xs text-accent-500 mt-1">
                {t('يجب أن تحتوي على أحرف كبيرة وصغيرة ورقم', 'Must contain uppercase, lowercase, and a number')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-accent-800 mb-2">{t('تأكيد كلمة المرور', 'Confirm password')}</label>
              <input
                type="password"
                required
                value={formData.confirmPassword}
                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 border border-accent-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all bg-white"
                placeholder={t('أعد كتابة كلمة المرور', 'Re-enter your password')}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary-500 hover:bg-primary-600 text-white font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-soft"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('جاري إنشاء الحساب...', 'Creating account...')}
                </span>
              ) : t('إنشاء حساب', 'Create account')}
            </button>
          </form>

          <p className="text-center text-accent-600 mt-8 text-sm">
            {t('لديك حساب بالفعل؟', 'Already have an account?')}{' '}
            <Link href="/login" className="text-primary-600 font-semibold hover:text-primary-700">
              {t('سجّل دخولك', 'Sign in')}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
