'use client';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useLang } from '@/contexts/LanguageContext';
import { t } from '@/lib/i18n';

export default function TermsPage() {
  useLang();
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-accent-50">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h1 className="text-3xl font-bold text-accent-900 mb-2">
            {t('شروط الاستخدام', 'Terms of Use')}
          </h1>
          <p className="text-accent-500 mb-10">
            {t('يُرجى قراءة هذه الشروط بعناية قبل استخدام المنصة', 'Please read these terms carefully before using the platform')}
          </p>

          <div className="space-y-8 bg-white rounded-xl border border-accent-200 shadow-soft p-8">
            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">
                {t('١. قبول الشروط', '1. Acceptance of terms')}
              </h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                {t(
                  'باستخدام منصة أ/ محمد الصباغ التعليمية، فإنك توافق على الالتزام بهذه الشروط والأحكام. إذا كنت لا توافق على أي من هذه الشروط، يُرجى عدم استخدام المنصة.',
                  "By using Mr. Mohamed Elsabbagh's learning platform, you agree to abide by these terms and conditions. If you do not agree to any of these terms, please do not use the platform."
                )}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">
                {t('٢. حساب المستخدم', '2. User account')}
              </h2>
              <ul className="text-sm text-accent-600 leading-relaxed space-y-2 list-disc list-inside">
                <li>{t('أنت مسؤول عن الحفاظ على سرية بيانات حسابك', 'You are responsible for keeping your account credentials confidential')}</li>
                <li>{t('يجب تقديم معلومات صحيحة ودقيقة عند التسجيل', 'You must provide accurate and truthful information when registering')}</li>
                <li>{t('يُحظر مشاركة الحساب مع أشخاص آخرين', 'Sharing your account with others is prohibited')}</li>
                <li>{t('نحتفظ بالحق في إيقاف أي حساب يُخالف هذه الشروط', 'We reserve the right to suspend any account that violates these terms')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">
                {t('٣. حقوق الملكية الفكرية', '3. Intellectual property rights')}
              </h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                {t(
                  'جميع المحتويات المنشورة على المنصة — بما في ذلك مقاطع الفيديو والمواد التعليمية والاختبارات — محمية بحقوق الملكية الفكرية. يُحظر تمامًا نسخ أو توزيع أو إعادة نشر أي محتوى دون إذن صريح مسبق.',
                  'All content published on the platform — including videos, educational materials, and exams — is protected by intellectual property rights. Copying, distributing, or republishing any content without explicit prior permission is strictly prohibited.'
                )}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">
                {t('٤. سياسة الاسترداد', '4. Refund policy')}
              </h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                {t(
                  'يمكنك طلب استرداد المبلغ خلال 7 أيام من تاريخ الاشتراك في حال عدم الاستفادة من المحتوى. بعد انقضاء هذه المدة أو بعد مشاهدة أكثر من 20% من المحتوى لا يحق المطالبة بالاسترداد.',
                  'You may request a refund within 7 days of enrollment if you have not benefited from the content. After this period or after viewing more than 20% of the content, refunds are not allowed.'
                )}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">
                {t('٥. السلوك المقبول', '5. Acceptable conduct')}
              </h2>
              <ul className="text-sm text-accent-600 leading-relaxed space-y-2 list-disc list-inside">
                <li>{t('يُحظر التصرف بأي طريقة قد تضر بالمنصة أو مستخدميها', 'Behavior that may harm the platform or its users is prohibited')}</li>
                <li>{t('يُحظر محاولة الوصول غير المصرح به لأي جزء من المنصة', 'Attempting unauthorized access to any part of the platform is prohibited')}</li>
                <li>{t('يُحظر نشر أي محتوى مسيء أو مضلل', 'Posting offensive or misleading content is prohibited')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-accent-800 mb-3">
                {t('٦. التواصل معنا', '6. Contact us')}
              </h2>
              <p className="text-sm text-accent-600 leading-relaxed">
                {t('لأي استفسار بشأن شروط الاستخدام، تواصل معنا على', 'For any inquiries about these terms, contact us at')}:{' '}
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
