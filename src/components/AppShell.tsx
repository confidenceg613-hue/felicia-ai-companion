import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useUser } from "@/hooks/useUser";
import { FELICIA, FELICIA_AVATAR_URL, FELICIA_MOODS } from "@/lib/felicia";
import { cn } from "@/lib/utils";
import { FeliciaAppearancePicker } from "@/components";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import type { NonNullableUser } from "@/types/global";

const NAV_ITEMS = [
  { label: "Chat", href: "/dashboard", description: "Talk with Felicia" },
  { label: "Album", href: "/dashboard/album", description: "Saved photos" },
  { label: "Notes", href: "/dashboard/notes", description: "Shared notes" },
  { label: "Memories", href: "/dashboard/memories", description: "Recalled moments" },
];

export default function AppShell() {
  const navigate = useNavigate();
  const { user, billingAccount, logout, clearConversation } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleOpenAppearance = () => setAppearanceOpen(true);
    const handleOpenMood = () => setMoodOpen(true);

    if (typeof window !== "undefined") {
      window.addEventListener("open-appearance", handleOpenAppearance);
      window.addEventListener("open-mood", handleOpenMood);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("open-appearance", handleOpenAppearance);
        window.removeEventListener("open-mood", handleOpenMood);
      }
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
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
            <NavSidebarButton
              icon={
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              }
              label="Chat"
              onClick={() => {
                setSidebarOpen(false);
                navigate("/dashboard");
              }}
            />
            <NavSidebarButton
              icon={<Images className="h-5 w-5" />}
              label="Album"
              onClick={() => {
                setSidebarOpen(false);
                navigate("/dashboard/album");
              }}
            />
            <NavSidebarButton
              icon={<Lightbulb className="h-5 w-5" />}
              label="Notes"
              onClick={() => {
                setSidebarOpen(false);
                navigate("/dashboard/notes");
              }}
            />
            <NavSidebarButton
              icon={<Brain className="h-5 w-5" />}
              label="Memories"
              onClick={() => {
                setSidebarOpen(false);
                navigate("/dashboard/memories");
              }}
            />
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
                    setAppearanceOpen(true);
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
          </svg>
          <h2 className="ml-3 font-medium">Felicia</h2>
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
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Chat
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => {
                  navigate("/dashboard/settings");
                }}
              >
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setAppearanceOpen(true);
                }}
              >
                <Palette className="mr-2 h-4 w-4" />
                How she looks
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setMoodOpen(true);
                }}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Change mood
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
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
            onClick={() => navigate("/dashboard/album")}
          >
            <Images className="h-5 w-5" />
            Album
          </button>
          <button
            className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => navigate("/dashboard/notes")}
          >
            <Lightbulb className="h-5 w-5" />
            Notes
          </button>
          <button
            className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => navigate("/dashboard/memories")}
          >
            <Brain className="h-5 w-5" />
            Memories
          </button>
          <button
            className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => navigate("/dashboard/settings")}
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
            <NavAvatar />
          </div>
        </header>
        <main className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col overflow-hidden">
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

      {/* Appearance picker */}
      <FeliciaAppearancePicker
        open={appearanceOpen}
        onOpenChange={setAppearanceOpen}
        value={{
          outfitKey: "ribbedTop",
          backgroundKey: "goldenHourBalcony",
          overrideScene: null,
        }}
        onChange={() => {
          setAppearanceOpen(false);
          toast.success("Look saved — she'll wear that next time you ask for a photo.");
        }}
      />

      {/* Mood picker */}
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
    </div>
  );
}

function NavSidebarButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function NavAvatar() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex size-9 items-center justify-center rounded-lg bg-muted/50">
        <span className="text-lg font-semibold">?</span>
      </div>
    );
  }

  return (
    <div className="flex size-9 items-center justify-center rounded-lg bg-muted/50">
      <span className="text-lg font-semibold">?</span>
    </div>
  );
}

import { Images, Lightbulb, Brain, Settings, User, LogOut, Palette, Trash2 } from "lucide-react";
