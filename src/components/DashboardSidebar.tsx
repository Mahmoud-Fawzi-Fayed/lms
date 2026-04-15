'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

interface SidebarLink {
  href: string;
  label: string;
  icon: string;
}

export default function DashboardSidebar({
  links,
  children,
}: {
  links: SidebarLink[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-accent-50 md:flex animate-fade-in">
      <div className="md:hidden sticky top-0 z-30 bg-white border-b border-accent-200 shadow-soft">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-accent-50"
            aria-label="فتح القائمة"
          >
            <svg className="w-6 h-6 text-accent-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link href="/" className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-soft flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
                <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
              </svg>
            </div>
            <span className="font-bold text-sm text-accent-800 truncate">لوحة التحكم</span>
          </Link>

          <div className="w-8 h-8 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0">
            {session?.user?.name?.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="إغلاق القائمة"
        />
      )}

      <aside className={`fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] bg-white border-l border-accent-200 flex flex-col shadow-soft transition-transform duration-300 md:static md:translate-x-0 md:w-64 md:max-w-none md:border-l-0 md:border-r ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-5 border-b border-accent-200 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 min-w-0" onClick={() => setMobileOpen(false)}>
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-soft flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
              </svg>
            </div>
            <span className="font-bold text-base text-accent-800 truncate">
              أ/<span className="text-primary-500"> محمد الصباغ</span>
            </span>
          </Link>

          <button type="button" className="md:hidden p-2 rounded-lg hover:bg-accent-50" onClick={() => setMobileOpen(false)}>
            <svg className="w-5 h-5 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 border-b border-accent-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-100 to-primary-200 rounded-lg flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0">
              {session?.user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-accent-900 text-sm truncate">{session?.user?.name}</div>
              <div className="text-xs text-accent-500">
                {(session?.user as any)?.role === 'admin' ? '👨‍💼 مسؤول' :
                 (session?.user as any)?.role === 'instructor' ? '👨‍🏫 محاضر' : '👤 طالب'}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {links.map(link => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary-50 text-primary-600 shadow-soft border border-primary-100'
                    : 'text-accent-600 hover:bg-accent-50 hover:text-accent-800'
                }`}
              >
                <span className="text-lg">{link.icon}</span>
                <span className="truncate">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-accent-200">
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors"
          >
            <span className="text-lg">🚪</span>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-accent-50">{children}</main>
    </div>
  );
}
