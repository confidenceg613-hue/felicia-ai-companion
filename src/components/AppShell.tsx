import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useUser } from "@/hooks/useUser";
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
} from "lucide-react";export default function AppShell() {
  const navigate = useNavigate();
  const { user, billingAccount, logout, clearConversation } = useUser();
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
          <div className="flex flex-col gap-2 p-2">              <button
                className="flex flex-col items-start gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => {
                  setSidebarOpen(false);
                  navigate("/dashboard");
                }}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
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
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
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
            <button>
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
              <NavAvatar />
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
    </>
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
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex size-9 items-center justify-center rounded-lg bg-muted/50">
      <span className="text-lg font-semibold">?</span>
    </div>
  );
}
