import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CLINICAL_FIELD_UNITS,
  type ClinicalFieldKey,
  getRangeHint,
  isOutOfRange,
} from "@/lib/clinical-ranges";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  fieldKey: ClinicalFieldKey;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number";
  className?: string;
};

export function ClinicalField({
  id,
  label,
  fieldKey,
  value,
  onChange,
  type = "text",
  className,
}: Props) {
  const unit = CLINICAL_FIELD_UNITS[fieldKey];
  const hint = getRangeHint(fieldKey, value);
  const outOfRange = isOutOfRange(fieldKey, value);
  const filled = value.trim() !== "" && !Number.isNaN(Number(value)) && type === "number";
  const showCheck = filled && !outOfRange && type === "number";

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            unit && !showCheck && "pr-12",
            showCheck && !unit && "pr-10",
            unit && showCheck && "pr-18",
            outOfRange && "border-amber-400 bg-amber-50 focus-visible:ring-amber-400/30",
          )}
        />
        {showCheck && (
          <Check
            className={cn(
              "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-teal-600 transition-opacity duration-150",
              unit ? "right-12 opacity-100" : "right-3 opacity-100",
            )}
            aria-hidden
          />
        )}
        {unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            {unit}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-amber-700">{hint}</p>}
    </div>
  );
}
