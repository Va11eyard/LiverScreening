import { ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type LabTab = "full" | "clinical";

type Props = {
  tab: LabTab;
  onTab: (tab: LabTab) => void;
};

const tabs: { id: LabTab; label: string }[] = [
  { id: "full", label: "УЗИ + клиника" },
  { id: "clinical", label: "Только FIB-4 / APRI" },
];

export function MlLabTabs({ tab, onTab }: Props) {
  return (
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-full bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={cn(
              "relative z-10 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150",
              tab === t.id ? "text-teal-700" : "text-slate-600 hover:text-slate-900",
            )}
          >
            {tab === t.id && (
              <motion.div
                layoutId="ml-lab-tab-pill"
                className="absolute inset-0 rounded-full bg-white shadow-sm"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>
      <a
        href={import.meta.env.VITE_PLATFORM_URL ?? "http://localhost:3004"}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-all duration-200 ease-out hover:bg-slate-50"
      >
        Клиническая платформа
        <ExternalLink className="size-3.5" />
      </a>
    </nav>
  );
}
