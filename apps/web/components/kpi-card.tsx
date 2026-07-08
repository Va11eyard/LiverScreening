import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiCardProps = {
  title: string;
  value: string | number;
  variant?: "default" | "danger" | "success" | "warning";
};

export function KpiCard({ title, value, variant = "default" }: KpiCardProps) {
  return (
    <Card
      className={cn(
        "shadow-results-card",
        variant === "danger" && "border-(--odos-risk-high-tint) bg-(--odos-risk-high-tint)",
        variant === "success" && "border-(--odos-badge-success-bg) bg-(--odos-risk-low-bg)",
        variant === "warning" && "border-(--odos-badge-warning-bg) bg-(--odos-badge-warning-bg)",
      )}
    >
      <CardHeader className="pb-2">
        <CardDescription className="text-hub-muted">{title}</CardDescription>
        <CardTitle className="font-heading text-3xl font-semibold tabular-nums text-hub-cta">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="hidden" />
    </Card>
  );
}
