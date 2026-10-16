import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { FELICIA, FELICIA_AVATAR_URL } from "@/lib/felicia";
import { THEME_OPTIONS, useTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useMutation } from "convex/react";
import { Check, Loader2, LogOut, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const THEME_ICON = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme, isDark } = useTheme();
  const clearConversation = useMutation(api.felicia.clearConversation);

  const [clearing, setClearing] = useState(false);

  const label =
    (typeof user?.name === "string" && user.name) ||
    (typeof user?.email === "string" ? user.email : "") ||
    "Your account";

  async function handleClear() {
    setClearing(true);
    try {
      await clearConversation();
      toast.success("Conversation cleared.");
    } catch {
      toast.error("Could not clear the conversation.");
    } finally {
      setClearing(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-border/50 px-4 py-4 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How the app looks, and who's signed in.
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {/* ------------------------------------------------------- appearance */}
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="font-display text-lg">Appearance</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Match your device and Felicia follows your system's light or dark
              setting automatically.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {THEME_OPTIONS.map((option) => {
                const Icon = THEME_ICON[option.value];
                const active = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value as Theme)}
                    className={cn(
                      "relative rounded-xl border p-4 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border/60 bg-background/40 hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <Icon
                        className={cn(
                          "size-4",
                          active ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      {active && (
                        <Check className="size-4 text-primary" />
                      )}
                    </div>
                    <p className="mt-3 text-sm font-medium">{option.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {option.hint}
                    </p>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Currently showing the{" "}
              <span className="font-medium text-foreground">
                {isDark ? "dark" : "light"}
              </span>{" "}
              theme.
            </p>
          </section>

          {/* ---------------------------------------------------------- account */}
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="font-display text-lg">Account</h2>

            <div className="mt-4 flex items-center gap-4">
              <div className="relative shrink-0">
                <img
                  src={FELICIA_AVATAR_URL}
                  alt=""
                  className="size-12 rounded-full border border-border/60 object-cover"
                />
                <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card bg-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Talking with {FELICIA.fullName}
                </p>
              </div>
            </div>

            <Separator className="my-5" />

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate("/dashboard/notes")}
              >
                Shared Notes
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate("/dashboard/memories")}
              >
                Mind map
              </Button>
              <Button
                variant="ghost"
                className="gap-2 text-muted-foreground"
                onClick={() => void handleSignOut()}
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
            </div>
          </section>

          {/* ------------------------------------------------------------- data */}
          <section className="rounded-2xl border border-destructive/30 bg-card p-5">
            <h2 className="font-display text-lg">Your data</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Clearing removes every message you've exchanged with Felicia. Her memories stay, but the conversation does not come back.
              album stays as it is.
            </p>

            <Button
              variant="outline"
              className="mt-4 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void handleClear()}
              disabled={clearing}
            >
              {clearing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Clear conversation
            </Button>
          </section>

          <p className="pb-4 text-center text-xs text-muted-foreground/70">
            {FELICIA.name} · a companion character, written warmly. Photos
            generated live with Cloudflare image/voice or Groq chat.
          </p>
        </div>
      </div>
    </div>
  );
}
