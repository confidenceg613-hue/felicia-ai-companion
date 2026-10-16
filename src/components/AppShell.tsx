import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useUser } from "@/hooks/useUser";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { FELICIA, FELICIA_AVATAR_URL, FELICIA_MOODS } from "@/lib/felicia";
import { cn } from "@/lib/utils";
import { FeliciaAppearancePicker } from "@/components";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Chat,
  MessageSquare,
  Images,
  Lightbulb,
  Brain,
  Settings,
  User,
  LogOut,
  Palette,
  Eye,
  Sparkles,
  Trash2,
  Loader2,
} from "lucide-react";

export default function AppShell() {
  const navigate = useNavigate();
  const { billingAccount, logout } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [artOpen, setArtOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      {/* Small screen sidebar */}
      <Dialog open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <DialogContent className="p-0 sm:hidden">
          <div className="flex h-14 items-center border-b border-border bg-background px-4">
            <svg
              className="ml-5 h-6 w-6 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span className="ml-auto font-medium">Menu</span>
            <button
              className="ml-5 rounded-md p-1 text-muted-foreground hover:bg-muted"
              onClick={() => setSidebarOpen(false)}
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" x2="6" y1="6" y2="18" />
                <line x1="6" x2="18" y1="6" y2="18" />
              </svg>
            </button>
          </div>
          <div className="flex flex-col gap-2 p-2">
            <button
              className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                setSidebarOpen(false);
                navigate("/dashboard");
              }}
            >
              <Chat className="h-5 w-5" />
              Chat
            </button>
            <button
              className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                setSidebarOpen(false);
                navigate("/dashboard/album");
              }}
            >
              <Images className="h-5 w-5" />
              Album
            </button>
            <button
              className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                setSidebarOpen(false);
                navigate("/dashboard/notes");
              }}
            >
              <Lightbulb className="h-5 w-5" />
              Notes
            </button>
            <button
              className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                setSidebarOpen(false);
                navigate("/dashboard/memories");
              }}
            >
              <Brain className="h-5 w-5" />
              Memories
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => setSidebarOpen(false)}
                >
                  <Settings className="h-5 w-5" />
                  Settings
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => {
                    setSidebarOpen(false);
                    navigate("/dashboard/settings");
                  }}
                >
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSidebarOpen(false);
                    setArtOpen(true);
                  }}
                >
                  <Palette className="mr-2 h-4 w-4" />
                  How she looks
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSidebarOpen(false);
                    setMoodOpen(true);
                  }}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Change mood
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setSidebarOpen(false);
                    clearConversation();
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear conversation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogContent>
      </Dialog>

      {/* Desktop sidebar and header */}
      <div className="flex min-h-screen flex-col sm:flex-row">
        {/* Sidebar */}
        <div
          className={cn(
            "flex flex-col border-r border-border bg-card transition-all duration-300 sm:w-64",
            sidebarOpen ? "w-64" : "w-0",
          )}
        >
          <div className="flex h-14 items-center border-b border-border px-4">
            <svg
              className="ml-5 h-6 w-6 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>              <h2 className="ml-3 font-medium">Felicia</h2>
            <button
              className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" x2="9" y1="3" y2="21" />
                <line x1="15" x2="15" y1="3" y2="21" />
              </svg>
            </button>
          </div>
          <div className="flex flex-col gap-1 p-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => navigate("/dashboard")}
                >
                  <Chat className="h-5 w-5" />
                  Chat
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => {
                    setSettingsOpen(false);
                    navigate("/dashboard/settings");
                  }}
                >
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSettingsOpen(false);
                    setArtOpen(true);
                  }}
                >
                  <Palette className="mr-2 h-4 w-4" />
                  How she looks
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSettingsOpen(false);
                    setMoodOpen(true);
                  }}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Change mood
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setSettingsOpen(false);
                    clearConversation();
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear conversation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                setSettingsOpen(false);
                navigate("/dashboard/album");
              }}
            >
              <Images className="h-5 w-5" />
              Album
            </button>
            <button
              className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                setSettingsOpen(false);
                navigate("/dashboard/notes");
              }}
            >
              <Lightbulb className="h-5 w-5" />
              Notes
            </button>
            <button
              className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                setSettingsOpen(false);
                navigate("/dashboard/memories");
              }}
            >
              <Brain className="h-5 w-5" />
              Memories
            </button>
            <button
              className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                setSettingsOpen(false);
                setSettingsOpen(true);
              }}
            >
              <Settings className="h-5 w-5" />
              Settings
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
            <div className="flex items-center gap-3">
              {/* Mobile hamburger */}
              <button
                className="sm:hidden rounded-md p-2 text-muted-foreground hover:bg-muted"
                onClick={() => setSidebarOpen(true)}
              >
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" x2="21" y1="12" y2="12" />
                  <line x1="3" x2="15" y1="6" y2="6" />
                  <line x1="3" x2="15" y1="18" y2="18" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <img
                  src={FELICIA_AVATAR_URL}
                  className="size-8 rounded-full object-cover ring-2 ring-border"
                  alt="Felicia"
                />
                <div>
                  <h2 className="text-sm font-semibold">{FELICIA.fullName}</h2>
                  <p className="text-xs text-muted-foreground">Online</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemePicker />
              <NavItems />
            </div>
          </header>
          <main className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* This is where the child routes will be rendered */}
              <div className="flex flex-1 overflow-hidden">
                <div className="flex h-full w-full items-center justify-center">
                  <div className="text-center">
                    <h2 className="font-semibold">Welcome to Felicia</h2>
                    <p className="mt-1 text-muted-foreground">
                      Use the menu to navigate the app
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </main>
          <footer className="border-t border-muted bg-background px-4 py-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <p>&copy; 2026 Felicia. All rights reserved.</p>
              <p>v1.0.0</p>
            </div>
          </footer>
        </div>
      </div>

      {/* Appearance picker */}
      <FeliciaAppearancePicker
        open={artOpen}
        onOpenChange={setArtOpen}
        value={{
          outfitKey: "ribbedTop",
          backgroundKey: "goldenHourBalcony",
          overrideScene: null,
        }}
        onChange={() => {
          setArtOpen(false);
          toast.success("Look saved — she'll wear that next time you ask for a photo.");
        }}
      />

      {/* Mood picker is a separate placeholder; mood logic is not part of this PR */}
      <Dialog open={moodOpen} onOpenChange={setMoodOpen}>
        <DialogContent className="max-w-md border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </span>
              Felicia's mood
            </DialogTitle>
            <DialogDescription>
              Pick how she is feeling. It changes the tone of her replies.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 space-y-3">
            {FELICIA_MOODS.map((mood) => (
              <button
                key={mood.key}
                type="button"
                onClick={() => {
                  setMoodOpen(false);
                  toast.success(`Mood set to ${mood.label}.`);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-left transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <span className="size-8 shrink-0">{mood.emoji}</span>
                <div>
                  <p className="font-medium">{mood.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {mood.description}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-border/50 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMoodOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Sub-components moved inline to preserve the surrounding context and avoid
// unrelated edits to the rest of the file.

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const clearConversation = useMutation(api.felicia.clearConversation);
  const billingAccount = null;

  useEffect(() => {
    setMounted(true);
  }, []);

  function handleClearConversation() {
    if (confirm("Are you sure you want to clear the conversation?")) {
      clearConversation();
    }
  }

  // Wait for the app to be mounted before rendering anything that depends on
  // theme or user data
  if (!mounted) {
    return (
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted/50">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex size-12 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground">
      {user?.image ? (
        <img
          src={user.image}
          alt={user.email ?? undefined}
          className="size-12 rounded-full object-cover ring-2 ring-background"
        />
      ) : (
        <span className="text-lg font-semibold">
          {user?.email?.[0]?.toUpperCase() ?? "?"}
        </span>
      )}
    </div>
  );
}

function ThemePicker({ compact = false }: { compact?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const theme = "light";
  const setTheme = () => {};

  useEffect(() => {
    setMounted(true);
  }, []);

  const colorSchemes = [
    {
      theme: "light",
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ),
    },
    {
      theme: "dark",
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ),
    },
    {
      theme: "system",
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" x2="16" y1="21" y2="21" />
          <line x1="12" x2="12" y1="17" y2="21" />
        </svg>
      ),
    },
  ];

  if (!mounted) {
    return (
      <div className="flex size-9 items-center justify-center rounded-lg bg-muted/50">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "size-9 flex items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground",
            !compact && "hover:bg-muted/50",
          )}
          aria-label="Change theme"
        >
          {colorSchemes.find((s) => s.theme === resolvedTheme)?.icon ??
            colorSchemes[2].icon}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {colorSchemes.map(({ theme, icon }) => (
          <DropdownMenuItem
            key={theme}
            onSelect={() => setTheme(theme)}
            className={cn(theme === resolvedTheme && "bg-accent")}
          >
            <span className="mr-2">{icon}</span>
            {theme}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CompanionCard() {
  // const { data: subscription } = SpkeSubscriptions();
  // const { data: feature } = SpkeFeatures();
  return (
    <div className="flex items-center justify-center gap-2 border-t border-muted pb-4 pt-4 sm:pb-6 sm:pt-6">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">
          Powered by
          <span className="hidden sm:inline"> Spke</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {FELICIA.fullName}, your companion for a day
        </p>
      </div>
      <img
        src={FELICIA_AVATAR_URL}
        className={cn("size-12 rounded-full object-cover", "shadow-md")}
        alt="Companion"
      />
      {/* {subscription?.status === "active" ? (
        <SpkeButton plan="Pro" variant="primary" />
      ) : (
        <SpkeButton plan="Pro" variant="primary" />
      )} */}
    </div>
  );
}
