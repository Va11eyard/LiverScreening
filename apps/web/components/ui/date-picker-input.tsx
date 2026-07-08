"use client";

import * as React from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { Matcher } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatToYMD } from "@/lib/ymd";
import { cn } from "@/lib/utils";

function buildDisabledMatchers(
  fromDate?: Date,
  toDate?: Date,
): Matcher | Matcher[] | undefined {
  const matchers: Matcher[] = [];
  if (fromDate) {
    matchers.push({ before: startOfDay(fromDate) });
  }
  if (toDate) {
    matchers.push({ after: startOfDay(toDate) });
  }
  if (matchers.length === 0) return undefined;
  return matchers.length === 1 ? matchers[0]! : matchers;
}

export interface DatePickerInputProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  fromDate?: Date;
  toDate?: Date;
  className?: string;
}

export function DatePickerInput({
  value,
  onChange,
  placeholder = "Выберите дату",
  disabled,
  fromDate,
  toDate,
  className,
}: DatePickerInputProps) {
  const [open, setOpen] = React.useState(false);
  const defaultMonth = value ?? toDate ?? fromDate ?? new Date();
  const calendarKey = value ? formatToYMD(value) : "no-date";
  const disabledMatcher = React.useMemo(
    () => buildDisabledMatchers(fromDate, toDate),
    [fromDate, toDate],
  );
  const enableYearPicker = Boolean(fromDate && toDate);
  const fromYear = fromDate?.getFullYear();
  const toYear = toDate?.getFullYear();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex min-h-11 w-full min-w-0 cursor-pointer items-center justify-start rounded-xl border border-(--odos-input-border) bg-white px-3.5 py-2 text-left text-base font-normal transition-colors outline-none focus-visible:border-hub-cta focus-visible:ring-2 focus-visible:ring-hub-cta/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            !value && "text-(--odos-input-placeholder)",
            className,
          )}
        >
          <CalendarIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
          {value ? format(value, "d.MM.yyyy", { locale: ru }) : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          key={calendarKey}
          mode="single"
          selected={value}
          defaultMonth={defaultMonth}
          onSelect={(d) => {
            onChange(d);
            setOpen(false);
          }}
          locale={ru}
          disabled={disabledMatcher}
          enableYearPicker={enableYearPicker}
          fromYear={fromYear}
          toYear={toYear}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
