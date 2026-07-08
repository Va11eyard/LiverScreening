import { useCallback, useState } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  file: File | null;
  preview: string | null;
  onFile: (file: File | null) => void;
};

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
      <p className="text-sm font-medium text-slate-700">УЗИ печени</p>
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
          "relative flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 transition-colors",
          dragOver ? "border-teal-500 bg-teal-50/50" : "border-slate-200 bg-slate-50/50",
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-white shadow-sm">
          <Upload className="size-5 text-teal-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">Перетащите снимок или выберите файл</p>
          <p className="text-xs text-slate-500">PNG, JPG до 10 MB</p>
        </div>
        <label className="cursor-pointer rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
          Выбрать файл
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
        {file && (
          <p className="flex items-center gap-1 text-xs text-slate-600">
            <ImagePlus className="size-3.5" />
            {file.name}
          </p>
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
