import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Props = {
  online: boolean;
};

export function MlLabHeader({ online }: Props) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <span className="mb-2 inline-block rounded-full border border-teal-100 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
          Прототип · отдельный контур
        </span>
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-slate-900">LiverScreening ML Lab</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-500">
          Загрузка УЗИ и тестирование модели без клинического регистра
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm">
        <span
          className={`size-2.5 rounded-full ${online ? "bg-green-500 status-pulse status-pulse-glow" : "bg-red-500"}`}
        />
        <Activity className="size-4 text-slate-400" />
        <span className="font-medium text-slate-700">ML API {online ? "online" : "offline"}</span>
        <Badge variant={online ? "success" : "danger"}>{online ? "OK" : "Down"}</Badge>
      </div>
    </header>
  );
}
