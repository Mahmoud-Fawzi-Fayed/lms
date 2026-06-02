'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useLang } from '@/contexts/LanguageContext';
import { t } from '@/lib/i18n';

const METHOD_LABELS: Record<string, string> = {
  card: 'بطاقة بنكية',
  fawry: 'فوري',
  wallet: 'محفظة إلكترونية',
};

export default function Navbar() {
  const { data: session, status } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { lang, setLang } = useLang();
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // Fetch once per session for students
  useEffect(() => {
    if (
      status !== 'authenticated' ||
      (session?.user as any)?.role !== 'student' ||
      fetchedRef.current
    ) return;
    fetchedRef.current = true;

    fetch('/api/payments/pending')
      .then(r => r.json())
      .then(d => { if (d.success) setPendingPayments(d.data.payments || []); })
      .catch(() => {});
  }, [status, session]);

  const resumePayment = async (payment: any) => {
    setResumingId(payment._id);
    try {
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: payment.course?._id, method: payment.method }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || t('فشل استئناف الدفع', 'Failed to resume payment')); return; }
      const url = data.data?.iframeUrl || data.data?.paymentUrl;
      if (url) { window.location.href = url; return; }
      if (data.data?.enrolled) {
        setPendingPayments(prev => prev.filter(p => p._id !== payment._id));
        return;
      }
    } catch { /* ignore */ } finally {
      setResumingId(null);
    }
  };


  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
  }, [pathname]);

  const navLinks = [
    { href: '/', label: t('الرئيسية', 'Home') },
    { href: '/courses', label: t('الكورسات', 'Courses') },
    { href: '/exams', label: t('الامتحانات', 'Exams') },
  ];

  const getDashboardLink = () => {
    if (!session) return '/login';
    switch ((session.user as any).role) {
      case 'admin':
        return '/dashboard/admin';
      case 'instructor':
        return '/dashboard/instructor';
      default:
        return '/dashboard/student';
    }
  };

  return (
    <>
    <nav className="bg-white/95 backdrop-blur-md border-b border-accent-200 sticky top-0 z-40 shadow-soft animate-fade-in">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-soft">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
              </svg>
            </div>
            <span className="font-bold text-base text-accent-800 hidden sm:inline">
              {t('أ/', 'Mr.')}<span className="text-primary-500">{t(' محمد الصباغ', ' Mohamed Elsabbagh')}</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? 'text-primary-600 font-semibold'
                    : 'text-accent-600 hover:text-primary-600'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {/* Language Toggle */}
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-accent-200 text-accent-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
              title={lang === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
            >
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
            {session ? (
              <div className="flex items-center gap-3">
                <Link
                  href={getDashboardLink()}
                  className="text-sm font-medium text-accent-600 hover:text-primary-600 transition-colors"
                >
                  {t('لوحة التحكم', 'Dashboard')}
                </Link>
                <div className="relative">
                  <button
                    onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent-50 transition-colors"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center text-xs font-bold text-primary-700">
                      {session.user?.name?.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-accent-800">
                      {session.user?.name?.split(' ')[0]}
                    </span>
                  </button>

                  {profileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-medium border border-accent-200 py-2 animate-slide-down">
                      <Link
                        href={getDashboardLink()}
                        className="block px-4 py-2.5 text-sm font-medium text-accent-700 hover:bg-accent-50"
                        onClick={() => setProfileMenuOpen(false)}
                      >
                        📊 {t('لوحة التحكم', 'Dashboard')}
                      </Link>
                      <Link
                        href="/dashboard/student/profile"
                        className="block px-4 py-2.5 text-sm font-medium text-accent-700 hover:bg-accent-50"
                        onClick={() => setProfileMenuOpen(false)}
                      >
                        👤 {t('الملف الشخصي', 'Profile')}
                      </Link>
                      <hr className="my-1 border-accent-100" />
                      <button
                        onClick={() => {
                          signOut({ callbackUrl: '/' });
                          setProfileMenuOpen(false);
                        }}
                        className="block w-full text-right px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        🚪 {t('تسجيل الخروج', 'Sign Out')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-accent-600 hover:text-primary-600 transition-colors"
                >
                  {t('دخول', 'Sign In')}
                </Link>
                <Link
                  href="/courses"
                  className="px-5 py-2 bg-primary-500 text-white text-sm font-semibold rounded-lg hover:bg-primary-600 transition-colors shadow-soft"
                >
                  {t('اشترك الآن', 'Sign Up Now')}
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-accent-50 transition-colors flex-shrink-0"
            aria-label={t('فتح القائمة', 'Open menu')}
          >
            <svg className="w-6 h-6 text-accent-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-accent-200 animate-slide-down">
            <div className="grid gap-2">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block rounded-xl px-3 py-3 text-sm font-medium ${pathname === link.href ? 'bg-primary-50 text-primary-700' : 'text-accent-700 hover:bg-accent-50 hover:text-primary-600'}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            {session ? (
              <div className="mt-4 rounded-xl border border-accent-200 p-3 bg-accent-50/70">
                <div className="text-sm font-semibold text-accent-800 mb-2">{session.user?.name}</div>
                <div className="flex flex-col gap-2">
                  <Link
                    href={getDashboardLink()}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-primary-600 bg-white border border-primary-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t('لوحة التحكم', 'Dashboard')}
                  </Link>
                  <button
                    onClick={() => {
                      signOut({ callbackUrl: '/' });
                      setMobileMenuOpen(false);
                    }}
                    className="block w-full text-right rounded-lg px-3 py-2 text-sm font-medium text-red-600 bg-white border border-red-100"
                  >
                    {t('تسجيل الخروج', 'Sign Out')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mt-4">
                <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-accent-700 bg-accent-50">{t('دخول', 'Sign In')}</Link>
                <Link href="/courses" className="rounded-lg px-3 py-2 text-sm font-semibold text-white bg-primary-600">{t('اشترك', 'Sign Up')}</Link>
              </div>
            )}
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="mt-3 w-full text-center rounded-lg px-3 py-2 text-sm font-medium text-accent-600 border border-accent-200 hover:border-primary-400 hover:text-primary-600"
            >
              {lang === 'ar' ? '🌐 Switch to English' : '🌐 التبديل للعربية'}
            </button>
          </div>
        )}
      </div>
    </nav>

    {/* ── Pending / Failed Payment Banner ─────────────────────────────────── */}
    {/* Shown sitewide for students who registered but haven't completed payment */}
    {pendingPayments.length > 0 && (
      <div className="sticky top-16 z-30 w-full">
        {pendingPayments.map(payment => (
          <div
            key={payment._id}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 bg-amber-400 text-amber-950"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-lg">⚠️</span>
              <span>
                {t('لم يكتمل دفع كورس:', 'Payment incomplete for:')}
                {' '}
                <strong>{payment.course?.title || t('كورس', 'Course')}</strong>
                {' — '}
                {METHOD_LABELS[payment.method] || payment.method}
                {' · '}
                {payment.amount} {t('ج.م', 'EGP')}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => resumePayment(payment)}
                disabled={resumingId === payment._id}
                className="px-4 py-1.5 bg-amber-900 hover:bg-amber-950 disabled:opacity-60 text-white text-xs font-bold rounded-lg transition-colors"
              >
                {resumingId === payment._id
                  ? t('جاري التحميل...', 'Loading...')
                  : t('أتمّ الدفع الآن', 'Complete Payment Now')}
              </button>
              <button
                onClick={() => setPendingPayments(prev => prev.filter(p => p._id !== payment._id))}
                className="p-1 rounded hover:bg-amber-500 transition-colors text-amber-900"
                title={t('إخفاء', 'Dismiss')}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
    </>
  );
}
