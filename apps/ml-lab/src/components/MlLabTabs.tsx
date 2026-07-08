import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export type LabTab = "full" | "clinical";

type Props = {
  tab: LabTab;
  onTab: (tab: LabTab) => void;
};

export function MlLabTabs({ tab, onTab }: Props) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onTab("full")}
        className={cn(
          "rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
          tab === "full"
            ? "border-teal-600 bg-teal-50 text-teal-700"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        )}
      >
        УЗИ + клиника
      </button>
      <button
        type="button"
        onClick={() => onTab("clinical")}
        className={cn(
          "rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
          tab === "clinical"
            ? "border-teal-600 bg-teal-50 text-teal-700"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        )}
      >
        Только FIB-4 / APRI
      </button>
      <a
        href="http://localhost:3004"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        Клиническая платформа
        <ExternalLink className="size-3.5" />
      </a>
    </nav>
  );
}
