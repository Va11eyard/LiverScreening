"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import { StaffAuthSplitLayout } from "@/components/staff-auth-split-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { loginSchema } from "@/lib/schemas";

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setError("");
    try {
      const res = await signIn("credentials", {
        ...values,
        redirect: false,
      });
      if (!res) {
        setError("Сервер временно недоступен. Попробуйте через минуту.");
        return;
      }
      if (res.error) {
        if (res.error === "Configuration" || res.status === 502) {
          setError("Сервер временно недоступен. Попробуйте через минуту.");
          return;
        }
        setError("Неверный email или пароль");
        return;
      }
      router.push("/cases");
    } catch {
      setError("Сервер временно недоступен. Попробуйте через минуту.");
    }
  }

  return (
    <StaffAuthSplitLayout title="Вход" subtitle="Платформа клинического пилота Eye Eye AI">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium text-hub-heading">
            Email
          </Label>
          <Input id="email" type="email" placeholder="coordinator@liver.kz" {...form.register("email")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium text-hub-heading">
            Пароль
          </Label>
          <PasswordInput id="password" placeholder="Введите пароль" {...form.register("password")} />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" variant="auth" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
          Войти
        </Button>
      </form>
    </StaffAuthSplitLayout>
  );
}
