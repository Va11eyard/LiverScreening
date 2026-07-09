export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatAdvisorResponse = {
  reply: string;
  protocols_cited?: string[];
  model?: string;
};

const ML_API = (import.meta.env.VITE_ML_API_URL as string | undefined)?.replace(/\/$/, "") || "";

function chatUrl(): string {
  if (ML_API) return `${ML_API}/chat/advisor`;
  return "/api/chat/advisor";
}

export async function askProtocolChat(
  message: string,
  history: ChatMessage[],
): Promise<ChatAdvisorResponse> {
  const res = await fetch(chatUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = (err as { detail?: string }).detail;
    throw new Error(detail || `Ошибка ${res.status}`);
  }
  return res.json() as Promise<ChatAdvisorResponse>;
}
