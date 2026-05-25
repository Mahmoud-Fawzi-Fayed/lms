'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import { ReactNode } from 'react';
import { LanguageProvider } from '@/contexts/LanguageContext';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
    <SessionProvider>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1e293b',
            color: '#f8fafc',
          },
          success: { style: { background: '#065f46' } },
          error: { style: { background: '#991b1b' } },
        }}
      />
    </SessionProvider>
    </LanguageProvider>
  );
}
