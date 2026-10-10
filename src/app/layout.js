import { Noto_Sans_Thai } from 'next/font/google';
import './globals.css';

const font = Noto_Sans_Thai({ subsets: ['thai', 'latin'], weight: ['400', '500', '700'] });

export const metadata = {
  title: 'AI Expense & Receipt Tracker',
  description: 'บันทึกรายจ่ายจากใบเสร็จด้วย AI',
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body className={font.className}>{children}</body>
    </html>
  );
}
