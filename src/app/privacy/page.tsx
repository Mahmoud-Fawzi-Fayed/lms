'use client';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useLang } from '@/contexts/LanguageContext';
import { t } from '@/lib/i18n';

export default function PrivacyPage() {
  useLang();
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-accent-50">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h1 className="text-3xl font-bold text-accent-900 mb-2">
            {t('سياسة الخصوصية', 'Privacy Policy')}
          </h1>
          <p className="text-accent-500 mb-10">
            {t('آخر تحديث: يناير 2025', 'Last updated: January 2025')}
          </p>

          <div className="space-y-8 bg-white rounded-xl border border-accent-200 shadow-soft p-8">
            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">
                {t('١. المعلومات التي نجمعها', '1. Information we collect')}
              </h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                {t(
                  'نجمع المعلومات التي تقدمها لنا مباشرةً عند إنشاء حساب أو التسجيل في الكورسات، كالاسم والبريد الإلكتروني وبيانات الدفع اللازمة لإتمام عملية الاشتراك.',
                  'We collect information you provide directly when creating an account or enrolling in courses, such as your name, email, and the payment details needed to complete enrollment.'
                )}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">
                {t('٢. كيف نستخدم معلوماتك', '2. How we use your information')}
              </h2>
              <ul className="text-sm text-accent-600 leading-relaxed space-y-2 list-disc list-inside">
                <li>{t('تقديم الخدمات التعليمية وإدارة حسابك', 'Providing educational services and managing your account')}</li>
                <li>{t('معالجة المدفوعات وإتمام عمليات الاشتراك', 'Processing payments and completing enrollments')}</li>
                <li>{t('التواصل معك بشأن الكورسات والتحديثات', 'Communicating with you about courses and updates')}</li>
                <li>{t('تحسين تجربة المستخدم على المنصة', 'Improving the user experience on the platform')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">
                {t('٣. حماية المعلومات', '3. Information protection')}
              </h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                {t(
                  'نحرص على حماية بياناتك الشخصية باستخدام أحدث تقنيات التشفير وبروتوكولات الأمان. لا نقوم ببيع أو مشاركة معلوماتك الشخصية مع أطراف ثالثة دون موافقتك.',
                  'We protect your personal data using modern encryption and security protocols. We do not sell or share your personal information with third parties without your consent.'
                )}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">
                {t('٤. ملفات تعريف الارتباط (Cookies)', '4. Cookies')}
              </h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                {t(
                  'نستخدم ملفات تعريف الارتباط لتحسين تجربتك على المنصة، مثل تذكّر بيانات تسجيل الدخول وتخصيص المحتوى المعروض لك.',
                  'We use cookies to improve your experience on the platform, such as remembering your login and personalizing the content shown to you.'
                )}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">
                {t('٥. التواصل معنا', '5. Contact us')}
              </h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                {t('إذا كان لديك أي استفسار حول سياسة الخصوصية، تواصل معنا على', 'If you have any questions about this privacy policy, contact us at')}:{' '}
                <a href="mailto:info@alsabbagh.com" className="text-primary-600 font-semibold hover:underline">
                  info@alsabbagh.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
