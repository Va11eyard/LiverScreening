import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { LandingPage } from "@/components/LandingPage";
import { LiverScreeningForm } from "@/components/LiverScreeningForm";
import { ProtocolChat } from "@/components/ProtocolChat";
import { Button } from "@/components/ui/button";

export default function App() {
  const [view, setView] = useState<"landing" | "screen">("landing");

  return (
    <>
      {view === "landing" ? (
        <LandingPage onStart={() => setView("screen")} />
      ) : (
        <div className="min-h-screen bg-hub-page">
          <div className="mx-auto max-w-2xl px-4 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setView("landing")}
              className="mb-2 gap-1"
            >
              <ArrowLeft className="size-4" />
              На главную
            </Button>
          </div>
          <div className="mx-auto max-w-2xl px-4 pb-16 pt-2">
            <LiverScreeningForm />
          </div>
        </div>
      )}
      <ProtocolChat />
    </>
  );
}
