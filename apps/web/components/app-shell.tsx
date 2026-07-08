"use client";

import * as React from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { XIcon } from "lucide-react";
import { useSession } from "next-auth/react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const user = {
    name: session?.user?.name ?? "Пользователь",
    hospital: session?.user?.hospital,
  };

  return (
    <>
      <div className="flex h-dvh min-h-0 overflow-hidden bg-hub-page">
        <aside className="hidden h-full min-h-0 shrink-0 md:block">
          <AppSidebar user={user} className="h-full" />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader onMenuClick={() => setMobileOpen(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto bg-hub-page px-4 pt-4 pb-6 md:px-6 md:pt-6">
            <div className="mx-auto h-fit w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="flex w-[272px] max-w-[272px] flex-col gap-0 border-0 bg-white p-0"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>
              <VisuallyHidden>Навигация</VisuallyHidden>
            </SheetTitle>
          </SheetHeader>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="pointer-events-none absolute top-3 right-3 z-10">
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="pointer-events-auto"
                  aria-label="Закрыть меню"
                >
                  <XIcon className="size-4" aria-hidden />
                </Button>
              </SheetClose>
            </div>
            <div className="box-border flex min-h-0 flex-1 flex-col overflow-hidden pt-12">
              <AppSidebar
                user={user}
                className="min-h-0 flex-1 rounded-none"
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
