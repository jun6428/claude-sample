import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'カタン - ボードゲーム',
  description: 'カタン互換のボードゲーム (オンライン対戦)',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-900 min-h-screen">
        {children}
      </body>
    </html>
  )
}
