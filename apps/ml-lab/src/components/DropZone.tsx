import { useCallback, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  file: File | null;
  preview: string | null;
  onFile: (file: File | null) => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function DropZone({ file, preview, onFile }: Props) {
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const next = files?.[0] ?? null;
      if (next && next.type.startsWith("image/")) onFile(next);
    },
    [onFile],
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "group relative flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 transition-all duration-200 ease-out",
          dragOver
            ? "scale-[1.01] border-teal-600 bg-teal-50/60"
            : "border-slate-200 bg-slate-50/50",
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-white shadow-sm">
          <Upload className="size-5 text-teal-600 group-hover:animate-bounce" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">Перетащите снимок или выберите файл</p>
          <p className="text-xs text-slate-500">PNG, JPG до 10 MB</p>
        </div>
        <label className="cursor-pointer rounded-xl bg-linear-to-r from-teal-600 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-out hover:shadow-md">
          Выбрать файл
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
        {file && preview && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <img
              src={preview}
              alt=""
              className="size-20 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 text-left">
              <p className="truncate text-sm font-medium text-slate-700">{file.name}</p>
              <p className="text-xs text-slate-500">({formatFileSize(file.size)})</p>
            </div>
          </div>
        )}
      </div>
      {preview && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black/5">
          <img src={preview} alt="Превью УЗИ" className="max-h-64 w-full object-contain" />
        </div>
      )}
    </div>
  );
}
