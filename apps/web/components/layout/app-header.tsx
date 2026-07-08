"use client";

import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AppHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  return (
    <header className="flex shrink-0 items-center bg-hub-page px-4 py-4 md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label="Меню"
        onClick={() => onMenuClick?.()}
      >
        <Menu className="size-5" />
      </Button>
    </header>
  );
}
