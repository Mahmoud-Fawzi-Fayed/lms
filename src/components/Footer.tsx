import Link from 'next/link';

function LogoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
      <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="bg-accent-900 text-accent-100 animate-fade-in">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10 mb-10 md:mb-12 text-center md:text-right">
          {/* Brand */}
          <div className="col-span-1">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-4">
              <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
                <LogoIcon />
              </div>
              <span className="font-bold text-base text-white">
                أ/<span className="text-primary-400"> محمد الصباغ</span>
              </span>
            </div>
            <p className="text-sm text-accent-300 leading-relaxed">
              منصة تعليمية حديثة توفر محتوى عالي الجودة وتجربة تعلّم استثنائية.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm">روابط سريعة</h3>
            <ul className="space-y-3">
              <li><Link href="/" className="text-sm text-accent-300 hover:text-primary-400 transition-colors">الرئيسية</Link></li>
              <li><Link href="/courses" className="text-sm text-accent-300 hover:text-primary-400 transition-colors">الكورسات</Link></li>
              <li><Link href="/dashboard/student/exams" className="text-sm text-accent-300 hover:text-primary-400 transition-colors">الامتحانات</Link></li>
              <li><Link href="/register" className="text-sm text-accent-300 hover:text-primary-400 transition-colors">إنشاء حساب</Link></li>
              <li><Link href="/login" className="text-sm text-accent-300 hover:text-primary-400 transition-colors">تسجيل الدخول</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm">المساعدة</h3>
            <ul className="space-y-3">
              <li><Link href="/faq" className="text-sm text-accent-300 hover:text-primary-400 transition-colors">الأسئلة الشائعة</Link></li>
              <li><Link href="/privacy" className="text-sm text-accent-300 hover:text-primary-400 transition-colors">سياسة الخصوصية</Link></li>
              <li><Link href="/terms" className="text-sm text-accent-300 hover:text-primary-400 transition-colors">شروط الاستخدام</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm">تواصل معنا</h3>
            <ul className="space-y-3">
              <li className="text-sm text-accent-300">📧 info@alsabbagh.com</li>
              <li className="text-sm text-accent-300">📱 +20 100 000 0000</li>
              <li className="text-sm text-accent-300">📍 مصر</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-accent-800 pt-6 md:pt-8 text-center text-sm text-accent-400">
          © {new Date().getFullYear()} أ/ محمد الصباغ. جميع الحقوق محفوظة.
        </div>
      </div>
    </footer>
  );
}
