import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Props = {
  online: boolean;
};

export function MlLabHeader({ online }: Props) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-teal-600">
          Прототип · отдельный контур
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">HepatoScreen ML Lab</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-500">
          Загрузка УЗИ и тестирование модели без клинического регистра
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm">
        <span
          className={`size-2.5 rounded-full ${online ? "bg-green-500 status-pulse" : "bg-red-500"}`}
        />
        <Activity className="size-4 text-slate-400" />
        <span className="font-medium text-slate-700">ML API {online ? "online" : "offline"}</span>
        <Badge variant={online ? "success" : "danger"}>{online ? "OK" : "Down"}</Badge>
      </div>
    </header>
  );
}
