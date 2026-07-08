"use client";

import { DatePickerInput } from "@/components/ui/date-picker-input";
import { formatToYMD, parseLocalYMD } from "@/lib/ymd";

export interface DateFieldProps {
  value: string;
  onChange: (ymd: string) => void;
  placeholder?: string;
  disabled?: boolean;
  fromYmd?: string;
  toYmd?: string;
  className?: string;
}

export function DateField({
  value,
  onChange,
  placeholder,
  disabled,
  fromYmd,
  toYmd,
  className,
}: DateFieldProps) {
  const date = parseLocalYMD(value);
  const fromDate = fromYmd ? parseLocalYMD(fromYmd) : undefined;
  const toDate = toYmd ? parseLocalYMD(toYmd) : undefined;

  return (
    <DatePickerInput
      value={date}
      onChange={(d) => onChange(d ? formatToYMD(d) : "")}
      placeholder={placeholder}
      disabled={disabled}
      fromDate={fromDate}
      toDate={toDate}
      className={className}
    />
  );
}
