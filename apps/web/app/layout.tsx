import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "HepatoScreen — Пилот",
  description: "Платформа клинического пилота HepatoScreen",
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
