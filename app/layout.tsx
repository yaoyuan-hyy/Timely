import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Timely",
  description: "A mobile-first reminder and calendar recording assistant."
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
