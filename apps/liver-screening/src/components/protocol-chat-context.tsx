import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";

import { askProtocolChat, type ChatMessage } from "@/lib/chat";

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "Здравствуйте! Я помогу с вопросами о скрининге печени и ХВГ. Согласно протоколу №1071 (ХВГ-B) и №1056 (ХВГ-C), при положительной серологии нужно подтвердить вирусную нагрузку. Чем могу помочь?",
};

type ProtocolChatContextValue = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  openChat: () => void;
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  loading: boolean;
  error: string;
  send: () => Promise<void>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
};

const ProtocolChatContext = createContext<ProtocolChatContextValue | null>(null);

export function ProtocolChatProvider({ children }: { children: ReactNode }) {
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

  const openChat = useCallback(() => {
    setOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("protocol-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <ProtocolChatContext.Provider
      value={{
        open,
        setOpen,
        openChat,
        messages,
        input,
        setInput,
        loading,
        error,
        send,
        bottomRef,
      }}
    >
      {children}
    </ProtocolChatContext.Provider>
  );
}

export function useProtocolChat() {
  const ctx = useContext(ProtocolChatContext);
  if (!ctx) throw new Error("useProtocolChat must be used within ProtocolChatProvider");
  return ctx;
}
