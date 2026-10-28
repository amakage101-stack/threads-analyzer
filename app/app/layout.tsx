import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Threads Analyzer",
  description: "Threadsアカウント分析ツール",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
