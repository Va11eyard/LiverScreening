import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  age: string;
  ast: string;
  alt: string;
  platelets: string;
  etiology: string;
  hbv: boolean;
  onAge: (v: string) => void;
  onAst: (v: string) => void;
  onAlt: (v: string) => void;
  onPlatelets: (v: string) => void;
  onEtiology: (v: string) => void;
  onHbv: (v: boolean) => void;
};

export function ClinicalForm({
  age,
  ast,
  alt,
  platelets,
  etiology,
  hbv,
  onAge,
  onAst,
  onAlt,
  onPlatelets,
  onEtiology,
  onHbv,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="age">Возраст</Label>
        <Input id="age" type="number" value={age} onChange={(e) => onAge(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ast">АСТ</Label>
        <Input id="ast" type="number" value={ast} onChange={(e) => onAst(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="alt">АЛТ</Label>
        <Input id="alt" type="number" value={alt} onChange={(e) => onAlt(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="platelets">Тромбоциты</Label>
        <Input
          id="platelets"
          type="number"
          value={platelets}
          onChange={(e) => onPlatelets(e.target.value)}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="etiology">Этиология</Label>
        <Input id="etiology" value={etiology} onChange={(e) => onEtiology(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
        <input
          type="checkbox"
          checked={hbv}
          onChange={(e) => onHbv(e.target.checked)}
          className="size-4 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
        />
        ХВГ+
      </label>
    </div>
  );
}
