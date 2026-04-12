'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'الرئيسية' },
    { href: '/courses', label: 'الكورسات' },
    { href: '/exams', label: 'الامتحانات' },
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
    <nav className="bg-white border-b border-accent-200 sticky top-0 z-40 shadow-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-soft">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
              </svg>
            </div>
            <span className="font-bold text-base text-accent-800 hidden sm:inline">
              أ/<span className="text-primary-500"> محمد الصباغ</span>
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
            {session ? (
              <div className="flex items-center gap-3">
                <Link
                  href={getDashboardLink()}
                  className="text-sm font-medium text-accent-600 hover:text-primary-600 transition-colors"
                >
                  لوحة التحكم
                </Link>
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent-50 transition-colors"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center text-xs font-bold text-primary-700">
                      {session.user?.name?.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-accent-800">
                      {session.user?.name?.split(' ')[0]}
                    </span>
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-medium border border-accent-200 py-2 animate-slide-down">
                      <Link
                        href={getDashboardLink()}
                        className="block px-4 py-2.5 text-sm font-medium text-accent-700 hover:bg-accent-50"
                        onClick={() => setMenuOpen(false)}
                      >
                        📊 لوحة التحكم
                      </Link>
                      <Link
                        href="/dashboard/student/profile"
                        className="block px-4 py-2.5 text-sm font-medium text-accent-700 hover:bg-accent-50"
                        onClick={() => setMenuOpen(false)}
                      >
                        👤 الملف الشخصي
                      </Link>
                      <hr className="my-1 border-accent-100" />
                      <button
                        onClick={() => {
                          signOut({ callbackUrl: '/' });
                          setMenuOpen(false);
                        }}
                        className="block w-full text-right px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        🚪 تسجيل الخروج
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
                  دخول
                </Link>
                <Link
                  href="/register"
                  className="px-5 py-2 bg-primary-500 text-white text-sm font-semibold rounded-lg hover:bg-primary-600 transition-colors shadow-soft"
                >
                  اشترك الآن
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-accent-50 transition-colors"
          >
            <svg className="w-6 h-6 text-accent-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden py-4 border-t border-accent-200 animate-slide-down">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="block py-2.5 text-sm font-medium text-accent-700 hover:text-primary-600"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {session ? (
              <>
                <Link
                  href={getDashboardLink()}
                  className="block py-2.5 text-sm font-medium text-primary-600"
                  onClick={() => setMenuOpen(false)}
                >
                  لوحة التحكم
                </Link>
                <button
                  onClick={() => {
                    signOut({ callbackUrl: '/' });
                    setMenuOpen(false);
                  }}
                  className="block py-2.5 text-sm font-medium text-red-600"
                >
                  تسجيل الخروج
                </button>
              </>
            ) : (
              <div className="flex gap-3 mt-3">
                <Link href="/login" className="text-sm font-medium text-accent-700">دخول</Link>
                <Link href="/register" className="text-sm font-semibold text-primary-600">اشترك</Link>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
