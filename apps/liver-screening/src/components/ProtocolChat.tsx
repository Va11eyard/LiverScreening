import { MessageCircle, X } from "lucide-react";

import { ProtocolChatPanel } from "@/components/ProtocolChatPanel";
import { useProtocolChat } from "@/components/protocol-chat-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  floatingPanel?: boolean;
};

export function ProtocolChat({ floatingPanel = false }: Props) {
  const { open, setOpen, openChat } = useProtocolChat();

  const handleFab = () => {
    if (floatingPanel) {
      setOpen((v) => !v);
      return;
    }
    openChat();
  };

  return (
    <>
      <Button
        type="button"
        aria-label="Открыть чат по протоколам"
        onClick={handleFab}
        className={cn(
          "fixed bottom-5 right-5 z-50 size-14 rounded-full shadow-hub-cta",
          open && floatingPanel && "bg-hub-navy",
        )}
      >
        {open && floatingPanel ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </Button>

      {floatingPanel && open && (
        <div className="fixed bottom-24 right-5 z-50">
          <ProtocolChatPanel className="shadow-auth-card" />
        </div>
      )}
    </>
  );
}
