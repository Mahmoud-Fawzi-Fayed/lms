/**
 * Centralized, translation-aware sidebar nav links for the dashboard.
 *
 * Use inside a Client Component AFTER calling `useLang()` so labels
 * re-render when the user toggles language:
 *
 *   import { useLang } from '@/contexts/LanguageContext';
 *   import { instructorLinks } from '@/lib/nav-links';
 *   useLang();
 *   const links = instructorLinks();
 */

import { t } from './i18n';

export const adminLinks = () => [
  { href: '/dashboard/admin',          label: t('لوحة التحكم',  'Dashboard'),   icon: '📊' },
  { href: '/dashboard/admin/users',    label: t('المستخدمين',   'Users'),       icon: '👥' },
  { href: '/dashboard/admin/courses',  label: t('الكورسات',     'Courses'),     icon: '📚' },
  { href: '/dashboard/admin/payments', label: t('المدفوعات',    'Payments'),    icon: '💳' },
];

export const instructorLinks = () => [
  { href: '/dashboard/instructor',             label: t('لوحة التحكم',  'Dashboard'),  icon: '📊' },
  { href: '/dashboard/instructor/courses',     label: t('كورساتي',      'My Courses'), icon: '📚' },
  { href: '/dashboard/instructor/courses/new', label: t('إنشاء كورس',   'New Course'), icon: '➕' },
  { href: '/dashboard/instructor/exams',       label: t('الاختبارات',   'Exams'),      icon: '📝' },
];

export const studentLinks = () => [
  { href: '/dashboard/student',         label: t('لوحة التحكم',     'Dashboard'),    icon: '📊' },
  { href: '/dashboard/student/courses', label: t('كورساتي',         'My Courses'),   icon: '📚' },
  { href: '/dashboard/student/exams',   label: t('اختباراتي',       'My Exams'),     icon: '📝' },
  { href: '/dashboard/student/profile', label: t('الملف الشخصي',   'Profile'),      icon: '👤' },
];
