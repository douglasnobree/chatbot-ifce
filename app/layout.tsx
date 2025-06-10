import type React from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Painel do Atendente - IFCE',
  description: 'Sistema de atendimento integrado para o IFCE',
  generator: 'v0.dev',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='pt-br'>
      <Providers>
        <body className={inter.className}>
          {children}
          </body>
      </Providers>
    </html>
  );
}
