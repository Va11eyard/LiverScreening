import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiverScreening — Пилот",
  description: "Платформа клинического пилота LiverScreening",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-dvh overflow-hidden" data-theme="light" suppressHydrationWarning>
      <body className="h-dvh overflow-hidden">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
