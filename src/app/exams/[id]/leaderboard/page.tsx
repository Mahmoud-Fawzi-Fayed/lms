'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';
import { useLang } from '@/contexts/LanguageContext';

export default function LeaderboardPage() {
  useLang();
  const { id } = useParams();
  const { data: session } = useSession();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard();
  }, [id]);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`/api/exams/${id}/leaderboard`);
      const data = await res.json();
      if (data.success) {
        setLeaderboard(data.data.leaderboard);
      } else {
        setError(data.error || t('تعذر تحميل قائمة المتصدرين', 'Failed to load leaderboard'));
      }
    } catch {
      setError(t('فشل الاتصال بالخادم', 'Connection failed'));
    } finally {
      setLoading(false);
    }
  };

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white';
      case 2:
        return 'bg-gradient-to-r from-gray-300 to-gray-400 text-white';
      case 3:
        return 'bg-gradient-to-r from-orange-400 to-orange-500 text-white';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">{t('🏆 قائمة المتفوقين', '🏆 Leaderboard')}</h1>
            <p className="text-slate-600">{t('أفضل المتقدمين في هذا الاختبار', 'Top performers in this exam')}</p>
          </div>

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-200" />
                    <div className="flex-1 h-4 bg-slate-200 rounded" />
                    <div className="w-16 h-6 bg-slate-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-16 bg-white rounded-2xl">
              <div className="text-5xl mb-4">🔒</div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">{error}</h3>
              {!session ? (
                <Link
                  href={`/login?callbackUrl=/exams/${id}/leaderboard`}
                  className="mt-4 inline-block px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-semibold"
                >
                  {t('سجّل دخولك للمتابعة', 'Log in to continue')}
                </Link>
              ) : (
                <Link
                  href={`/exams/${id}`}
                  className="mt-4 inline-block px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-semibold"
                >
                  {t('اذهب للاختبار', 'Go to exam')}
                </Link>
              )}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">{t('لا توجد نتائج بعد', 'No results yet')}</h3>
              <p className="text-slate-600">{t('كن أول من يخوض هذا الاختبار!', 'Be the first to take this exam!')}</p>
            </div>
          ) : (
            <>
              {/* Top 3 Podium */}
              {leaderboard.length >= 3 && (
                <div className="flex items-end justify-center gap-4 mb-10">
                  {/* 2nd Place */}
                  <div className="text-center flex-1 max-w-[160px]">
                    <div className="bg-white rounded-2xl shadow-sm border p-4 mb-2">
                      <div className="text-3xl mb-2">🥈</div>
                      <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto mb-2 flex items-center justify-center">
                        <span className="font-bold text-gray-600">
                          {leaderboard[1].name?.charAt(0)}
                        </span>
                      </div>
                      <div className="font-semibold text-gray-900 text-sm truncate">
                        {leaderboard[1].name}
                      </div>
                      <div className="text-xl font-bold text-gray-700">{leaderboard[1].bestScore}%</div>
                    </div>
                    <div className="h-16 bg-gray-300 rounded-t-lg" />
                  </div>

                  {/* 1st Place */}
                  <div className="text-center flex-1 max-w-[180px]">
                    <div className="bg-white rounded-2xl shadow-lg border-2 border-yellow-300 p-4 mb-2">
                      <div className="text-4xl mb-2">🥇</div>
                      <div className="w-14 h-14 bg-yellow-100 rounded-full mx-auto mb-2 flex items-center justify-center">
                        <span className="font-bold text-yellow-700 text-lg">
                          {leaderboard[0].name?.charAt(0)}
                        </span>
                      </div>
                      <div className="font-bold text-gray-900 truncate">
                        {leaderboard[0].name}
                      </div>
                      <div className="text-2xl font-bold text-yellow-600">{leaderboard[0].bestScore}%</div>
                    </div>
                    <div className="h-24 bg-yellow-400 rounded-t-lg" />
                  </div>

                  {/* 3rd Place */}
                  <div className="text-center flex-1 max-w-[160px]">
                    <div className="bg-white rounded-2xl shadow-sm border p-4 mb-2">
                      <div className="text-3xl mb-2">🥉</div>
                      <div className="w-12 h-12 bg-orange-100 rounded-full mx-auto mb-2 flex items-center justify-center">
                        <span className="font-bold text-orange-600">
                          {leaderboard[2].name?.charAt(0)}
                        </span>
                      </div>
                      <div className="font-semibold text-gray-900 text-sm truncate">
                        {leaderboard[2].name}
                      </div>
                      <div className="text-xl font-bold text-orange-600">{leaderboard[2].bestScore}%</div>
                    </div>
                    <div className="h-10 bg-orange-400 rounded-t-lg" />
                  </div>
                </div>
              )}

              {/* Full List */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 text-sm font-medium text-slate-600 border-b">
                  <div className="col-span-1">{t('الترتيب', 'Rank')}</div>
                  <div className="col-span-5">{t('الطالب', 'Student')}</div>
                  <div className="col-span-2 text-center">{t('الدرجة', 'Score')}</div>
                  <div className="col-span-2 text-center">{t('المحاولات', 'Attempts')}</div>
                  <div className="col-span-2 text-center">{t('الحالة', 'Status')}</div>
                </div>

                {leaderboard.map((entry, i) => {
                  const isCurrentUser = session?.user?.name === entry.name;
                  return (
                    <div
                      key={i}
                      className={`grid grid-cols-12 gap-4 px-6 py-4 items-center border-b last:border-0 ${
                        isCurrentUser ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="col-span-1">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${getRankStyle(entry.rank)}`}>
                          {entry.rank <= 3 ? '' : entry.rank}
                          {entry.rank <= 3 && <span className="text-lg">{getRankIcon(entry.rank)}</span>}
                        </span>
                      </div>
                      <div className="col-span-5 flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-700 font-semibold text-sm">
                            {entry.name?.charAt(0)}
                          </span>
                        </div>
                        <span className={`font-medium ${isCurrentUser ? 'text-blue-700' : 'text-slate-900'}`}>
                          {entry.name} {isCurrentUser && `(${t('أنت', 'You')})`}
                        </span>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className="font-bold text-slate-900">{entry.bestScore}%</span>
                      </div>
                      <div className="col-span-2 text-center text-slate-600">
                        {entry.attempts}
                      </div>
                      <div className="col-span-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            entry.passed
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {entry.passed ? t('ناجح', 'Passed') : t('راسب', 'Failed')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="text-center mt-8">
            <button
              onClick={() => window.history.back()}
              className="px-6 py-2 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
            >
              ← {t('رجوع', 'Back')}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
