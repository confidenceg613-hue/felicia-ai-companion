import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

/**
 * An adults-only gate.
 *
 * This is a companion character written for grown-ups: the conversation can go
 * anywhere, and the person on the other end is fiction. An intimate product
 * needs to say that before it is used, not in a footer — so the first visit
 * asks once, remembers the answer on this device, and an honest "no" closes the
 * door instead of opening the chat.
 */
const STORAGE_KEY = "felicia.adult-confirmed.v1";

function readConfirmed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "yes";
  } catch {
    // Private browsing with storage disabled: ask again rather than assume.
    return false;
  }
}

export default function AgeGate() {
  const [confirmed, setConfirmed] = useState(readConfirmed);
  const [declined, setDeclined] = useState(false);

  if (confirmed) return null;

  function accept() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "yes");
    } catch {
      // The choice still counts for this session.
    }
    setConfirmed(true);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Age confirmation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 px-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm rounded-3xl border border-border/60 bg-card p-6 shadow-2xl"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </span>

        {declined ? (
          <>
            <h1 className="mt-4 font-display text-xl tracking-tight">
              Not for you yet
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Felicia is written for adults. Come back when you're eighteen — she
              will still be here.
            </p>
            <Button
              variant="outline"
              className="mt-5 w-full rounded-full"
              onClick={() => setDeclined(false)}
            >
              I made a mistake
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-4 font-display text-xl tracking-tight">
              Felicia is for adults
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              She is a fictional companion, not a real person, and conversations
              with her can be intimate. This app is for people aged 18 and over.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground/80">
              Your conversations stay on your account. She is an AI, and she is
              always clearly her — never somebody real.
            </p>

            <div className="mt-5 flex flex-col gap-2">
              <Button className="w-full rounded-full" onClick={accept}>
                I'm 18 or older
              </Button>
              <Button
                variant="ghost"
                className="w-full rounded-full text-muted-foreground"
                onClick={() => setDeclined(true)}
              >
                I'm under 18
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
