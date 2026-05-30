import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { rateLimit } from '@/lib/api-helpers';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('البريد الإلكتروني وكلمة المرور مطلوبان');
        }

        // Credential-stuffing / brute-force protection.
        // Rate-limit by IP AND by target email so a single attacker cannot
        // try thousands of passwords against one account, and a botnet cannot
        // try one password against thousands of accounts from one IP.
        // Per-process in-memory counter — see api-helpers note on multi-instance.
        const ipHeader =
          (req?.headers as any)?.['x-forwarded-for'] ||
          (req?.headers as any)?.['x-real-ip'] ||
          'unknown';
        const ip = Array.isArray(ipHeader) ? ipHeader[0] : String(ipHeader).split(',')[0].trim();
        const email = String(credentials.email).toLowerCase().trim();

        // 10 attempts / 15 min per IP, 5 attempts / 15 min per account.
        const ipOk = rateLimit(`login:ip:${ip}`, 10, 15 * 60 * 1000);
        const emailOk = rateLimit(`login:email:${email}`, 5, 15 * 60 * 1000);
        if (!ipOk || !emailOk) {
          throw new Error('محاولات تسجيل دخول كثيرة. حاول مرة أخرى لاحقاً.');
        }

        await connectDB();

        const user = await User.findOne({
          email: credentials.email.toLowerCase().trim(),
        }).select('+password');

        if (!user) {
          throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        }

        if (!user.isActive) {
          throw new Error('الحساب غير مفعل حالياً. تواصل مع الدعم الفني.');
        }
        // Subscription status no longer gates login.
        // Content access is controlled per-course via Enrollment records,
        // not by a global subscription flag. Blocking login prevents students
        // from logging in to complete a pending course purchase.

        const isValid = await user.comparePassword(credentials.password);
        if (!isValid) {
          throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          academicYear: user.academicYear,
          academicTerm: (user as any).academicTerm,
          subscriptionStatus: (user as any).subscriptionStatus,
          image: user.avatar,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.academicYear = (user as any).academicYear;
        token.academicTerm = (user as any).academicTerm;
        token.subscriptionStatus = (user as any).subscriptionStatus;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).academicYear = token.academicYear;
        (session.user as any).academicTerm = token.academicTerm;
        (session.user as any).subscriptionStatus = token.subscriptionStatus;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  // Lock down session cookies: SameSite=Lax (Strict breaks OAuth redirect flows but Lax is fine here),
  // HttpOnly so JS can't read them, Secure in production.
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Secure-next-auth.session-token'
          : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    callbackUrl: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Secure-next-auth.callback-url'
          : 'next-auth.callback-url',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Host-next-auth.csrf-token'
          : 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
