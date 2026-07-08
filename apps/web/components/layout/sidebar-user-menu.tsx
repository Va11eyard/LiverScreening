"use client";

import * as React from "react";
import { LogOut, User } from "lucide-react";
import { signOut } from "next-auth/react";

import { cn } from "@/lib/utils";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

export function SidebarUserMenu({ userName, className }: { userName: string; className?: string }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const label = initials(userName);

  return (
    <div ref={ref} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        aria-label="Меню профиля"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        className={cn(
          "inline-flex size-10 cursor-pointer items-center justify-center rounded-full",
          "bg-(--odos-hub-profile-bg) text-sm font-semibold text-(--odos-hub-cta-light)",
          "ring-1 ring-(--odos-hub-profile-bg) transition-colors",
          "hover:bg-(--odos-hub-profile-bg-hover) hover:ring-(--odos-hub-profile-bg-hover)",
        )}
      >
        {label !== "?" ? label : <User className="size-5" aria-hidden />}
      </button>

      {menuOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Закрыть"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute left-0 bottom-full z-50 mb-2 w-52 overflow-hidden rounded-2xl border border-(--odos-input-border) bg-white py-1 shadow-results-card">
            <p className="truncate px-4 py-2 text-xs text-hub-muted">{userName}</p>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-hub-heading hover:bg-hub-page"
              onClick={() => void signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="size-4" aria-hidden />
              Выйти
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
