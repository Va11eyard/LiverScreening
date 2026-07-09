import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useProtocolChat } from "@/components/protocol-chat-context";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  className?: string;
  embedded?: boolean;
};

export function ProtocolChatPanel({ id, className, embedded = false }: Props) {
  const { messages, input, setInput, loading, error, send, bottomRef } = useProtocolChat();

  return (
    <Card
      id={id}
      className={cn(
        "flex flex-col overflow-hidden border-0 shadow-results-card",
        embedded ? "h-[min(70vh,520px)]" : "h-[min(70vh,520px)] w-[min(100vw-2rem,380px)]",
        className,
      )}
    >
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
  );
}
