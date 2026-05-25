'use client';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useLang } from '@/contexts/LanguageContext';
import { t } from '@/lib/i18n';

export default function FAQPage() {
  useLang();
  const faqs = [
    {
      q: t('كيف يمكنني التسجيل في الكورسات؟', 'How do I register for courses?'),
      a: t(
        'قم بإنشاء حساب جديد من خلال صفحة التسجيل، ثم تصفح الكورسات المتاحة واختر الكورس المناسب لك.',
        'Create a new account from the registration page, then browse available courses and pick the one that suits you.'
      ),
    },
    {
      q: t('هل يمكنني الوصول للمحتوى بعد انتهاء الكورس؟', 'Can I access content after the course ends?'),
      a: t(
        'نعم، يمكنك الوصول لمحتوى الكورسات التي سجّلت فيها في أي وقت ومن أي جهاز.',
        'Yes, you can access content from any course you enrolled in, anytime and from any device.'
      ),
    },
    {
      q: t('كيف يمكنني التواصل مع الأستاذ؟', 'How can I contact the instructor?'),
      a: t(
        'يمكنك التواصل معنا عبر البريد الإلكتروني info@alsabbagh.com أو عبر رقم الهاتف الموجود في قسم تواصل معنا.',
        'You can reach us at info@alsabbagh.com or via the phone number in the Contact Us section.'
      ),
    },
    {
      q: t('هل يوجد شهادات بعد إتمام الكورس؟', 'Are there certificates after completing a course?'),
      a: t(
        'نعم، يحصل الطلاب على شهادة إتمام بعد اجتياز الكورس والاختبارات المطلوبة بنجاح.',
        'Yes, students receive a completion certificate after successfully passing the course and required exams.'
      ),
    },
    {
      q: t('ما هي طرق الدفع المتاحة؟', 'What payment methods are available?'),
      a: t(
        'نقبل الدفع عبر بطاقات الائتمان والخصم المباشر، إضافةً إلى المحافظ الإلكترونية.',
        'We accept credit and debit cards, plus electronic wallets.'
      ),
    },
    {
      q: t('كيف أعيد تعيين كلمة المرور؟', 'How do I reset my password?'),
      a: t(
        'تواصل معنا عبر البريد الإلكتروني وسنساعدك في إعادة تعيين كلمة المرور.',
        'Contact us by email and we will help you reset your password.'
      ),
    },
  ];

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-accent-50">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h1 className="text-3xl font-bold text-accent-900 mb-2">
            {t('الأسئلة الشائعة', 'Frequently Asked Questions')}
          </h1>
          <p className="text-accent-500 mb-10">
            {t('إجابات على أكثر الأسئلة شيوعاً لدى طلابنا', 'Answers to the most common questions from our students')}
          </p>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-accent-200 shadow-soft p-6">
                <h3 className="font-semibold text-accent-800 mb-2">{faq.q}</h3>
                <p className="text-sm text-accent-500 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 bg-primary-50 border border-primary-100 rounded-xl p-6 text-center">
            <p className="text-accent-700 font-medium mb-1">
              {t('لم تجد إجابة لسؤالك؟', "Didn't find an answer to your question?")}
            </p>
            <p className="text-sm text-accent-500">
              {t('تواصل معنا على', 'Contact us at')}{' '}
              <a href="mailto:info@alsabbagh.com" className="text-primary-600 font-semibold hover:underline">
                info@alsabbagh.com
              </a>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
