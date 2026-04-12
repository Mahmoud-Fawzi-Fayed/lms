import NextAuth, { DefaultSession } from 'next-auth';
import { JWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'admin' | 'instructor' | 'student';
      academicYear?: string;
    } & DefaultSession['user'];
  }
  interface User {
    role: 'admin' | 'instructor' | 'student';
    academicYear?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: 'admin' | 'instructor' | 'student';
    academicYear?: string;
  }
}
