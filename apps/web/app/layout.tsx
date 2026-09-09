import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "HealthManager++ · 家庭健康档案",
  description:
    "私有优先的个人与家庭健康管理系统：体检报告上传解析、指标趋势追踪、AI 健康解读",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={cn(GeistSans.variable, GeistMono.variable, 'antialiased')}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
