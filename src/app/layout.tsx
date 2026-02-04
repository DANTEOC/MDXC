import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MDXC - Control Documental',
  description: 'Sistema de Gestión y Control Documental',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} min-h-screen bg-neutral-50 flex overflow-hidden`} suppressHydrationWarning={true}>
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
