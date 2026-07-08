import { ClinicalField } from "@/components/ClinicalField";
import { FormSection } from "@/components/FormSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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
    <div className="space-y-5">
      <FormSection title="Демография" description="Базовые данные пациента">
        <div className="grid gap-4 sm:grid-cols-2">
          <ClinicalField
            id="age"
            label="Возраст"
            fieldKey="age"
            type="number"
            value={age}
            onChange={onAge}
          />
        </div>
      </FormSection>

      <FormSection title="Биохимия крови" description="Показатели для FIB-4 и APRI">
        <div className="grid gap-4 sm:grid-cols-2">
          <ClinicalField
            id="ast"
            label="АСТ"
            fieldKey="ast"
            type="number"
            value={ast}
            onChange={onAst}
          />
          <ClinicalField
            id="alt"
            label="АЛТ"
            fieldKey="alt"
            type="number"
            value={alt}
            onChange={onAlt}
          />
          <ClinicalField
            id="platelets"
            label="Тромбоциты"
            fieldKey="platelets"
            type="number"
            value={platelets}
            onChange={onPlatelets}
          />
        </div>
      </FormSection>

      <FormSection title="Клинический контекст" description="Этиология и факторы риска">
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="etiology" className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Этиология
            </Label>
            <Input
              id="etiology"
              value={etiology}
              onChange={(e) => onEtiology(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3">
            <div>
              <Label htmlFor="hbv" className="text-sm font-medium text-slate-700">
                ХВГ+
              </Label>
              <p className="text-xs text-slate-500">Хронический вирусный гепатит B</p>
            </div>
            <Switch id="hbv" checked={hbv} onCheckedChange={onHbv} />
          </div>
        </div>
      </FormSection>
    </div>
  );
}
