"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, FilePlus2, FlaskConical, HeartPulse, LineChart } from "lucide-react";

import { cn } from "@/lib/utils";
import { mlLabUrl, screeningAppUrl } from "@/lib/site-urls";

import { SidebarUserMenu } from "./sidebar-user-menu";

const navItems = [
  { href: "/cases/new", label: "Карта пациента", icon: FilePlus2 },
  { href: "/cases", label: "Еженедельный отчёт", icon: ClipboardList },
  { href: "/survey", label: "Продуктовые метрики", icon: LineChart },
];

function navItemActive(pathname: string, href: string) {
  if (pathname === href) return true;

  if (href === "/cases") {
    const segment = pathname.match(/^\/cases\/([^/]+)$/)?.[1];
    return segment !== undefined && segment !== "new";
  }

  return pathname.startsWith(`${href}/`);
}

export function AppSidebar({
  user,
  className,
  onNavigate,
}: {
  user: { name: string; hospital?: string | null };
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "flex h-full w-[272px] shrink-0 flex-col bg-white",
        "rounded-tr-[24px] rounded-br-[24px]",
        className,
      )}
    >
      <div className="px-6 pt-7 pb-4">
        <Link href="/cases" className="inline-flex items-center" onClick={() => onNavigate?.()}>
          <span className="font-heading text-xl font-bold tracking-tight text-hub-heading">LiverScreening</span>
        </Link>
        <p className="mt-2 text-xs font-medium text-hub-muted">Клинический пилот · 2026</p>
      </div>

      {user.hospital ? (
        <div className="px-4 pb-4">
          <div className="rounded-2xl bg-hub-page px-4 py-3.5">
            <p className="text-xs font-medium text-hub-muted">Центр</p>
            <p className="mt-1 text-sm font-semibold leading-snug text-hub-heading">{user.hospital}</p>
          </div>
        </div>
      ) : null}

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
        {navItems.map((item) => {
          const active = navItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavigate?.()}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
                active ? "text-hub-cta" : "text-hub-heading hover:bg-hub-page",
              )}
            >
              <Icon
                className={cn("size-[18px] shrink-0", active ? "text-hub-cta" : "text-hub-heading")}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Link>
          );
        })}
        <a
          href={screeningAppUrl()}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-hub-heading transition-colors hover:bg-hub-page"
        >
          <HeartPulse className="size-[18px] shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Скрининг пациента</span>
        </a>
        <a
          href={mlLabUrl()}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-hub-heading transition-colors hover:bg-hub-page"
        >
          <FlaskConical className="size-[18px] shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">ML Lab (тест модели)</span>
        </a>
      </nav>

      <div className="mt-auto shrink-0 border-t border-(--odos-input-border)/60 px-4 pt-5 pb-6">
        <div className="flex items-center gap-3">
          <SidebarUserMenu userName={user.name} />
        </div>
      </div>
    </div>
  );
}
