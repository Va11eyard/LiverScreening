import type { ReactNode } from "react";
import Link from "next/link";

type StaffAuthSplitLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

function BrandMark({ large }: { large?: boolean }) {
  return (
    <span
      className={
        large
          ? "font-heading text-3xl font-bold tracking-tight text-hub-heading"
          : "font-heading text-xl font-bold tracking-tight text-hub-heading"
      }
    >
      LiverScreening
    </span>
  );
}

export function StaffAuthSplitLayout({
  title,
  subtitle,
  children,
  footer,
}: StaffAuthSplitLayoutProps) {
  return (
    <div className="flex min-h-dvh min-w-[375px] flex-col overflow-hidden lg:flex-row">
      <section className="relative flex min-h-dvh flex-1 flex-col bg-auth-page px-5 py-8 text-foreground lg:w-1/2 lg:max-w-[50%] lg:px-10 lg:py-10">
        <header className="shrink-0">
          <Link href="/login" className="inline-flex items-center">
            <BrandMark />
          </Link>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center py-8">
          <div className="w-full max-w-[400px] rounded-2xl bg-white px-8 py-10 shadow-auth-card">
            <div className="mb-8 flex flex-col items-center gap-4 text-center">
              <BrandMark large />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-hub-heading">{title}</h1>
                {subtitle ? <p className="mt-1 text-sm text-hub-muted">{subtitle}</p> : null}
              </div>
            </div>
            {children}
          </div>
          {footer ? <div className="mt-6 w-full max-w-[400px]">{footer}</div> : null}
        </div>
      </section>

      <section
        className="relative hidden min-h-dvh flex-1 bg-linear-to-br from-hub-navy via-hub-cta to-hub-page lg:block lg:w-1/2 lg:max-w-[50%]"
        aria-hidden
      />
    </div>
  );
}
