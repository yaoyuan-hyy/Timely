import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Timely",
  description: "A mobile-first natural-language event recording app."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
