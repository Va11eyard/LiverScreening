"use client";

import { FileImage, ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { cloneFilesForUpload, MAX_CASE_IMAGES } from "@/lib/case-image-files";
import { cn } from "@/lib/utils";

const ACCEPT = ".jpg,.jpeg,.png,.tif,.tiff,.heic,.heif,image/jpeg,image/png,image/tiff,image/heic,image/heif";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  className?: string;
  maxFiles?: number;
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function CaseImageUpload({ files, onChange, className, maxFiles = MAX_CASE_IMAGES }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);

  async function addFiles(incoming: FileList | File[]) {
    if (loading) return;
    setLoading(true);
    try {
      const result = await cloneFilesForUpload(incoming, files, maxFiles);
      onChange(result.files);

      const added = result.files.length - files.length;
      if (added > 0) {
        toast.success(added === 1 ? "Снимок добавлен" : `Добавлено снимков: ${added}`);
      }
      if (result.skippedLarge > 0) {
        toast.warning(
          result.skippedLarge === 1
            ? "1 снимок больше 20 МБ и не добавлен"
            : `${result.skippedLarge} снимков больше 20 МБ и не добавлены`,
        );
      }
      if (result.skippedEmpty > 0) {
        toast.warning("Не удалось прочитать один или несколько снимков. Попробуйте выбрать снова.");
      }
      if (result.skippedLimit > 0) {
        toast.warning(`Максимум ${maxFiles} снимков на карту`);
      }
      if (added === 0 && result.skippedLarge === 0 && result.skippedEmpty === 0 && result.skippedLimit === 0) {
        toast.error("Снимки не выбраны");
      }
    } finally {
      setLoading(false);
    }
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files;
          if (picked?.length) void addFiles(picked);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
          dragOver
            ? "border-hub-cta bg-(--odos-hub-cta-tint-10)"
            : "border-(--odos-input-border) bg-hub-page hover:border-hub-cta/40",
          loading && "pointer-events-none opacity-70",
        )}
      >
        {loading ? (
          <Loader2 className="size-8 animate-spin text-hub-muted" aria-hidden />
        ) : (
          <ImagePlus className="size-8 text-hub-muted" aria-hidden />
        )}
        <p className="text-sm text-hub-body">
          {loading ? (
            "Подготовка снимков…"
          ) : (
            <>
              Нажмите для выбора или добавьте ещё ·{" "}
              <span className="font-medium text-hub-cta">можно несколько сразу</span>
            </>
          )}
        </p>
        <p className="text-xs text-hub-muted">
          JPG, PNG, TIFF — до 20 МБ, максимум {maxFiles} файлов. Минимум 1 снимок.
        </p>
        {files.length > 0 ? (
          <p className="text-xs font-medium text-hub-cta">Выбрано: {files.length}</p>
        ) : null}
      </button>

      {files.length > 0 ? (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-3 rounded-xl border border-(--odos-input-border) bg-white px-3 py-2"
            >
              <FileImage className="size-5 shrink-0 text-hub-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-hub-heading">{file.name}</p>
                <p className="text-xs text-hub-muted">{formatSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="rounded-lg p-1 text-hub-muted hover:bg-hub-page hover:text-hub-heading"
                aria-label={`Удалить ${file.name}`}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
