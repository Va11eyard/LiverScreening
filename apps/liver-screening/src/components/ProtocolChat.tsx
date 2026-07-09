import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { askProtocolChat, type ChatMessage } from "@/lib/chat";
import { cn } from "@/lib/utils";

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "Здравствуйте! Я помогу с вопросами о скрининге печени и ХВГ. Согласно протоколу №1071 (ХВГ-B) и №1056 (ХВГ-C), при положительной серологии нужно подтвердить вирусную нагрузку. Чем могу помочь?",
};

export function ProtocolChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setError("");
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await askProtocolChat(text, messages);
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка чата");
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  return (
    <>
      <Button
        type="button"
        aria-label="Открыть чат по протоколам"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-5 right-5 z-50 size-14 rounded-full shadow-hub-cta",
          open && "bg-hub-navy",
        )}
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </Button>

      {open && (
        <Card className="fixed bottom-24 right-5 z-50 flex h-[min(70vh,520px)] w-[min(100vw-2rem,380px)] flex-col overflow-hidden border-0 shadow-auth-card">
          <div className="border-b border-(--odos-input-border) bg-linear-to-r from-hub-navy to-hub-cta px-4 py-3 text-white">
            <p className="text-sm font-bold">Ассистент по протоколам</p>
            <p className="text-xs text-white/80">№523 · №1082 · №1071 · №1056</p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-hub-page p-3">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={cn(
                  "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-hub-cta text-white"
                    : "mr-auto bg-white text-hub-body shadow-sm",
                )}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-hub-muted">
                <Loader2 className="size-4 animate-spin" />
                Ищу в протоколах…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && <p className="px-3 text-xs text-danger">{error}</p>}

          <form
            className="flex gap-2 border-t border-(--odos-input-border) bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Спросите про ХВГ, FIB-4…"
              className="min-w-0 flex-1 rounded-xl border border-(--odos-input-border) px-3 py-2 text-sm outline-none focus:border-hub-cta"
              disabled={loading}
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Отправить">
              <Send className="size-4" />
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
