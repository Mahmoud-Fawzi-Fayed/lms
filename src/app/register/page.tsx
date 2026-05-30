'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { signIn } from 'next-auth/react';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';
import { ACADEMIC_YEARS, ACADEMIC_TERMS, academicYearLabel } from '@/lib/validations';

function RegisterContent() {
  useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  // courseId is REQUIRED — registration is only allowed in the context of buying a course.
  const courseId = searchParams.get('courseId') || '';
  // Sanitize callbackUrl: only relative same-origin paths.
  const rawCallback = searchParams.get('callbackUrl') || '/dashboard';
  const callbackUrl = /^\/(?!\/)/.test(rawCallback) ? rawCallback : '/dashboard';

  const [step, setStep] = useState<'year' | 'form'>('year');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedTerm, setSelectedTerm] = useState<'term1' | 'term2' | 'full_year' | ''>('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    subscriptionMethod: 'card' as 'card' | 'fawry' | 'wallet',
    agreeToSubscription: false,
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

    if (!selectedYear || !selectedTerm) {
      toast.error(t('اختر السنة الدراسية ونظام الدراسة أولاً', 'Select academic year and term first'));
      return;
    }

    if (!formData.agreeToSubscription) {
      toast.error(t('يجب تأكيد الاشتراك لإتمام التسجيل', 'You must confirm subscription to continue'));
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
          academicTerm: selectedTerm,
          subscriptionMethod: formData.subscriptionMethod,
          agreeToSubscription: formData.agreeToSubscription,            courseId: courseId || undefined,        }),
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
        // After sign-in, initiate payment for the selected course.
        if (courseId && formData.subscriptionMethod) {
          try {
            const payRes = await fetch('/api/payments/initiate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ courseId, method: formData.subscriptionMethod }),
            });
            const payData = await payRes.json();

            if (payData.data?.enrolled) {
              // Free course — already enrolled
              toast.success(t('تم التسجيل بنجاح!', 'Enrolled successfully!'));
              router.push(callbackUrl);
              router.refresh();
              return;
            }

            if (payData.data?.iframeUrl) {
              // Redirect to Paymob payment iframe
              window.location.href = payData.data.iframeUrl;
              return;
            }

            if (payData.data?.paymentUrl) {
              window.location.href = payData.data.paymentUrl;
              return;
            }

            if (payData.data?.fawryRef) {
              toast.success(`${t('مرجع فوري:', 'Fawry ref:')} ${payData.data.fawryRef}`);
              router.push(callbackUrl);
              router.refresh();
              return;
            }

            // Payment initiation failed — go to course page to retry
            toast.error(payData.error || t('تعذر بدء عملية الدفع. حاول مرة أخرى من صفحة الكورس.', 'Payment failed to start. Try again from the course page.'));
            router.push(callbackUrl);
            router.refresh();
          } catch {
            toast.error(t('حدث خطأ أثناء بدء الدفع. توجه إلى صفحة الكورس.', 'Payment error. Go to the course page to retry.'));
            router.push(callbackUrl);
            router.refresh();
          }
        } else {
          router.push(callbackUrl);
          router.refresh();
        }
      } else {
        router.push('/login');
      }
    } catch {
      toast.error(t('حدث خطأ. حاول مرة أخرى.', 'An error occurred. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const selectedYearMeta = ACADEMIC_YEARS.find(y => y.value === selectedYear);
  const selectedIsGrade2Secondary = selectedYear === 'grade2_secondary';

  const selectYear = (year: string) => {
    setSelectedYear(year);
    if (year === 'grade2_secondary') {
      setSelectedTerm('full_year');
    } else if (selectedTerm === 'full_year') {
      setSelectedTerm('');
    }
  };

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
        <div className="w-full max-w-3xl bg-white rounded-xl shadow-soft border border-accent-200 p-8">
          <h1 className="text-3xl font-bold text-accent-900 mb-2 text-center">
            {t('اختر سنتك الدراسية', 'Choose your academic year')}
          </h1>
          <p className="text-accent-600 text-center mb-10 text-lg">
            {t('ستظهر لك الكورسات المناسبة لمستواك', 'Courses matching your level will be shown')}
          </p>

          <div className="space-y-6">
            <div className="overflow-x-auto pb-2">
              <div className="inline-flex min-w-full gap-2">
                {ACADEMIC_YEARS.map(y => (
                  <button
                    key={y.value}
                    type="button"
                    onClick={() => selectYear(y.value)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap border transition-colors ${
                      selectedYear === y.value
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {academicYearLabel(y.value)}
                  </button>
                ))}
              </div>
            </div>

            {selectedYear && (
              <div className="border border-accent-200 rounded-2xl p-5 bg-accent-50/40">
                <h3 className="font-bold text-accent-900 mb-3">
                  {t('اختر نظام الدراسة', 'Choose study term')} · {selectedYearMeta ? academicYearLabel(selectedYearMeta.value) : ''}
                </h3>

                {selectedIsGrade2Secondary ? (
                  <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-primary-800 text-sm font-semibold">
                    {t('الصف الثاني الثانوي نظام سنوي (مباشر بدون ترمين)', 'Grade 2 Secondary is full-year (direct, no terms)')}
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {ACADEMIC_TERMS.filter(term => term.value !== 'full_year').map(term => (
                      <button
                        key={term.value}
                        type="button"
                        onClick={() => setSelectedTerm(term.value)}
                        className={`rounded-xl border px-4 py-4 text-sm font-semibold transition-colors ${
                          selectedTerm === term.value
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {t(term.label, term.labelEn)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={!selectedYear || !selectedTerm}
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
              {selectedTerm ? ` • ${t(
                selectedTerm === 'term1' ? 'الفصل الأول' : selectedTerm === 'term2' ? 'الفصل الثاني' : 'سنوي',
                selectedTerm === 'term1' ? 'Term 1' : selectedTerm === 'term2' ? 'Term 2' : 'Full year'
              )}` : ''}
            </span>
          </button>

          <h1 className="text-3xl font-bold text-accent-900 mb-2">
            {t('إنشاء حساب', 'Create an account')}
          </h1>
          <p className="text-accent-600 mb-8">
            {t('سجّل بياناتك لإتمام عملية الشراء', 'Fill in your details to complete your purchase')}
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

            <div className="border border-primary-200 rounded-xl p-4 bg-primary-50/50 space-y-3">
              <h3 className="text-sm font-bold text-accent-900">
                {t('الاشتراك أثناء التسجيل', 'Subscription during registration')}
              </h3>

              <select
                value={formData.subscriptionMethod}
                onChange={e => setFormData({ ...formData, subscriptionMethod: e.target.value as 'card' | 'fawry' | 'wallet' })}
                className="w-full px-4 py-3 border border-accent-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all bg-white"
              >
                <option value="card">{t('بطاقة بنكية', 'Bank card')}</option>
                <option value="fawry">{t('فوري', 'Fawry')}</option>
                <option value="wallet">{t('محفظة إلكترونية', 'Wallet')}</option>
              </select>

              <label className="flex items-start gap-2 text-sm text-accent-700">
                <input
                  type="checkbox"
                  checked={formData.agreeToSubscription}
                  onChange={e => setFormData({ ...formData, agreeToSubscription: e.target.checked })}
                  className="mt-1"
                />
                <span>
                  {t('أوافق على إتمام الاشتراك مع التسجيل. التسجيل بدون اشتراك غير متاح.', 'I agree to complete subscription with registration. Registration without subscription is not available.')}
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !formData.agreeToSubscription}
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
            <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="text-primary-600 font-semibold hover:text-primary-700">
              {t('سجّل دخولك', 'Sign in')}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" /></div>}>
      <RegisterContent />
    </Suspense>
  );
}
