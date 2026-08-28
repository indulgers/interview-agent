import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'AI 模拟面试',
  description: '面向 Node.js 全栈 + AI Agent 岗位的中文模拟面试。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
