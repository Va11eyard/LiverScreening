"use client";

import { useEffect, useState } from "react";

import { caseImageUrl } from "@/lib/api";

type Props = {
  caseId: string;
  imageId: string;
  alt: string;
  className?: string;
};

export function CaseImagePreview({ caseId, imageId, alt, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    async function load() {
      setFailed(false);
      setSrc(null);
      try {
        const res = await fetch(caseImageUrl(caseId, imageId), {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("load failed");
        }
        const blob = await res.blob();
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setSrc(revoked);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [caseId, imageId]);

  if (failed) {
    return (
      <div className={className} title="Не удалось загрузить превью">
        <span className="flex h-full w-full items-center justify-center text-xs text-hub-muted">Нет превью</span>
      </div>
    );
  }

  if (!src) {
    return (
      <div className={className}>
        <span className="flex h-full w-full items-center justify-center text-xs text-hub-muted">…</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  );
}
