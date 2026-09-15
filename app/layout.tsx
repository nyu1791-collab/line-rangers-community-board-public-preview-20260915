import type { Metadata } from "next";
import "./globals.css";
import "./community.css";

export const metadata: Metadata = {
  title: "新キャラ情報掲示板 | LINEレンジャー",
  description: "新キャラについて投票・コメント・動画で話そう。",
  icons: {icon: "/favicon.svg"},
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
