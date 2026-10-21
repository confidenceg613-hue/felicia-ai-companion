import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { useFeliciaAvatar } from "@/hooks/use-felicia-avatar";
import { FELICIA } from "@/lib/felicia";
import { THEME_OPTIONS, useTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { GUEST_MERGE_KEY } from "@/lib/upgrade";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarDays,
  Check,
  Heart,
  Images,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import { motion } from "framer-motion";
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
  const avatarUrl = useFeliciaAvatar();

  const relationship = useQuery(api.felicia.relationship);
  const prefs = useQuery(api.felicia.prefs);
  const savePrefs = useMutation(api.felicia.savePrefs);

  const gap = prefs?.minGapHours ?? 5;
  const quietStart = prefs?.quietStart ?? 23;
  const quietEnd = prefs?.quietEnd ?? 7;

  const GAPS = [
    { value: 0, label: "Never", hint: "You start every conversation." },
    { value: 5, label: "Every 5 hours", hint: "A check-in when a thread goes quiet." },
    { value: 24, label: "Once a day", hint: "At most one message a day." },
  ];

  const QUIETS = [
    { start: 23, end: 7, label: "23:00 – 07:00" },
    { start: 22, end: 8, label: "22:00 – 08:00" },
    { start: 0, end: 0, label: "No quiet hours" },
  ];

  async function chooseGap(hours: number) {
    try {
      await savePrefs({ minGapHours: hours, quietStart, quietEnd });
      toast.success(
        hours === 0
          ? "She'll wait for you to write first."
          : hours === 24
            ? "She'll reach out once a day at most."
            : `She'll reach out every ${hours} hours of quiet.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save that.",
      );
    }
  }

  async function chooseQuiet(start: number, end: number) {
    try {
      await savePrefs({ minGapHours: gap, quietStart: start, quietEnd: end });
      toast.success(
        start === end
          ? "Quiet hours off — she'll text whenever the moment comes."
          : `She'll stay quiet from ${QUIETS.find((q) => q.start === start)?.label ?? "23:00 – 07:00"}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save that.",
      );
    }
  }

  const label =
    (typeof user?.name === "string" && user.name) ||
    (typeof user?.email === "string" ? user.email : "") ||
    "Your account";

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="glass sticky top-0 z-20 rounded-none border-x-0 border-t-0 px-4 py-4 sm:rounded-b-3xl sm:border-x sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-display text-3xl tracking-tight">
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
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="surface rounded-3xl p-6"
          >
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
                        <motion.span
                          initial={{ scale: 0, rotate: -25 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 520,
                            damping: 18,
                          }}
                          className="flex"
                        >
                          <Check className="size-4 text-primary" />
                        </motion.span>
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
          </motion.section>

          {/* ------------------------------------------------- the two of you */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.45,
              delay: 0.06,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="surface rounded-3xl p-6"
          >
            <h2 className="font-display text-lg">The two of you</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              How long this has been going on. Nothing here is a score to chase —
              it is just the truth about a conversation that keeps going.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                {
                  Icon: CalendarDays,
                  value: relationship ? `Day ${relationship.days}` : "Today",
                  label: "together",
                },
                {
                  Icon: Images,
                  value: String(relationship?.photos ?? 0),
                  label: "photos from her",
                },
                {
                  Icon: Heart,
                  value: relationship?.firstAt
                    ? new Date(relationship.firstAt).toLocaleDateString([], {
                        day: "numeric",
                        month: "short",
                      })
                    : "—",
                  label: "first met",
                },
              ].map(({ Icon, value, label: caption }) => (
                <div
                  key={caption}
                  className="rounded-xl border border-border/60 bg-background/40 p-3"
                >
                  <Icon className="size-4 text-primary" />
                  <p className="mt-2 font-display text-lg leading-none">
                    {value}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {caption}
                  </p>
                </div>
              ))}
            </div>
          </motion.section>

          {/* ------------------------------------------------ when she texts */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.45,
              delay: 0.07,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="surface rounded-3xl p-6"
          >
            <h2 className="font-display text-lg">When she texts first</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              She would rather hear from you, but she will open the conversation
              when it goes quiet. You decide how often, and when she has to stay
              silent.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {GAPS.map((option) => {
                const active = gap === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => void chooseGap(option.value)}
                    className={cn(
                      "relative rounded-xl border p-4 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border/60 bg-background/40 hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{option.label}</span>
                      {active && (
                        <motion.span
                          initial={{ scale: 0, rotate: -25 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 520,
                            damping: 18,
                          }}
                          className="flex"
                        >
                          <Check className="size-4 text-primary" />
                        </motion.span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {option.hint}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Moon className="size-3.5" />
              Quiet hours in Lagos
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUIETS.map((option) => {
                const active =
                  quietStart === option.start && quietEnd === option.end;
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => void chooseQuiet(option.start, option.end)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground/80">
              Times are Felicia's own clock in Lagos (UTC+1), so a 23:00 quiet
              hour is 23:00 where she is.
            </p>
          </motion.section>

          {/* ---------------------------------------------------------- account */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.45,
              delay: 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="surface rounded-3xl p-6"
          >
            <h2 className="font-display text-lg">Account</h2>

            <div className="mt-4 flex items-center gap-4">
              <div className="relative shrink-0">
                <img
                  src={avatarUrl}
                  alt=""
                  className="size-12 rounded-full border border-border/60 object-cover"
                />
                <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card bg-chart-2" />
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
          </motion.section>

          {/* -------------------------------------------------------- guest */}
          {user?.isAnonymous && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                delay: 0.24,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="surface rounded-3xl p-6"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-lg">Make this permanent</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    You're browsing as a guest, which is tied to this device —
                    sign out and this conversation stays behind. Tie it to an
                    email and it follows you to any device, forever.
                  </p>
                </div>
              </div>

              <Button
                className="mt-4 gap-2"
                onClick={() => {
                  sessionStorage.setItem(GUEST_MERGE_KEY, String(user._id));
                  void navigate("/auth?upgrade=1");
                }}
              >
                Make my account permanent
              </Button>
            </motion.section>
          )}

          {/* ------------------------------------------------------------- data */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.45,
              delay: 0.16,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="surface rounded-3xl p-6"
          >
            <h2 className="font-display text-lg">Your data</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Everything the two of you have ever said is kept for good. Signing
              out keeps it, closing the tab keeps it, and signing back in with
              the same email brings the whole conversation back exactly where it
              was. Nothing in this app deletes a message you have sent or a
              message she has sent you — there is no delete button anywhere, and
              that is on purpose.
            </p>
          </motion.section>

          <p className="pb-4 text-center text-xs text-muted-foreground/70">
            {FELICIA.name} · a companion character, written warmly. Photos
            generated live; her voice (Piper, en_US/sam/medium) runs on your own
            device.
          </p>
        </div>
      </div>
    </div>
  );
}
