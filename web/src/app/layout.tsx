import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Threads 帳號分析' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
