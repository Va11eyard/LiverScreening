import { format } from "date-fns";

export function parseLocalYMD(ymd: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) {
    return undefined;
  }
  return dt;
}

export function formatToYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
