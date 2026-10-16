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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
  SidebarInset,
} from "@/components/ui/sidebar";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import type { NonNullableUser } from "@/types/global";

const NAV_ITEMS = [
  {
    label: "Chat",
    href: "/dashboard",
    description: "Talk with Felicia",
  },
  {
    label: "Album",
    href: "/dashboard/album",
    description: "Saved photos",
  },
  {
    label: "Notes",
    href: "/dashboard/notes",
    description: "Shared notes",
  },
  {
    label: "Memories",
    href: "/dashboard/memories",
    description: "Recalled moments",
  },
] as const;

const APP_CTA_ITEMS = [
  {
    label: "How she looks",
    href: "#appearance",
    description: "Outfit, background, and scenes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
        <circle cx="12" cy="8" r="4" />
        <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path d="M12 13v4" />
        <path d="M9 17h6" />
      </svg>
    ),
  },
  {
    label: "Mood",
    href: "#mood",
    description: "Set how she is feeling",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
        <path d="M8 20c0-2 2-3.5 4-3.5s4 1.5 4 3.5" />
      </svg>
    ),
  },
] as const;

export default function AppShell() {
  const navigate = useNavigate();
  const { user, billingAccount, logout, clearConversation } = useUser();
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();
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
    <SidebarProvider>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6">
          <SidebarTrigger className="-ml-3 rounded-full text-muted-foreground shadow-sm ring-1 ring-border/50 hover:bg-muted" aria-label="Open sidebar" />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-sm font-medium">
              <span className="hidden sm:inline text-muted-foreground">Felicia</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-foreground">{FELICIA.fullName}</span>
            </div>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden sm:inline">Online</span>
              <span className="flex size-2 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-background" />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <UserMenu
              user={user}
              billingAccount={billingAccount}
              logout={logout}
              clearConversation={clearConversation}
            />
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col">
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
              <div className="flex flex-col rounded-2xl border border-border/60 bg-card p-6 sm:p-8 shadow-sm">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-muted">
                    <Sparkles className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Dashboard</p>
                    <p className="text-xs text-muted-foreground">
                      Use the sidebar to move around
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 min-w-0">
                <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <div>
                      <p className="text-sm font-medium">Recent activity</p>
                      <p className="text-xs text-muted-foreground">Nothing here yet</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-muted-foreground">
                      View all
                    </Button>
                  </div>
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-border/60 p-4 text-sm text-muted-foreground">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </span>
                    <span>Start a conversation to see activity here</span>
                  </div>
                </section>

                <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <div>
                      <p className="text-sm font-medium">Quick actions</p>
                      <p className="text-xs text-muted-foreground">Shortcuts for the rest of the app</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <NavCta
                      label="Album"
                      href="/dashboard/album"
                      description="Saved photos"
                      icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="m21 15-5-5L5 21" />
                        </svg>
                      }
                    />
                    <NavCta
                      label="Notes"
                      href="/dashboard/notes"
                      description="Shared notes"
                      icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      }
                    />
                    <NavCta
                      label="Memories"
                      href="/dashboard/memories"
                      description="Recalled moments"
                      icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                      }
                    />
                    <NavCta
                      label="Settings"
                      href="/dashboard/settings"
                      description="Account & preferences"
                      icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                      }
                    />
                  </div>
                </section>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>

      <Sidebar className="border-r bg-sidebar">
        <div className="flex h-14 items-center border-b px-4">
          <SidebarTrigger className="hidden -ml-3 rounded-full text-muted-foreground shadow-sm ring-1 ring-border/50 hover:bg-muted" aria-label="Open sidebar" />
          <div className="flex items-center gap-3 text-sm font-medium">
            <span className="hidden sm:inline text-muted-foreground">Felicia</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground">{FELICIA.fullName}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex size-2 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-sidebar-background" />
            <span className="hidden sm:inline">Online</span>
          </div>
        </div>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.description}
                    onClick={() => navigate(item.href)}
                  >
                    <a
                      href={item.href}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      <span className="flex size-6 items-center justify-center rounded-md bg-sidebar-accent-foreground/10 text-sidebar-accent-foreground">
                        {NAV_ICONS[item.href]}
                      </span>
                      <span className="flex flex-col leading-tight">
                        {item.label}
                        <span className="text-xs font-normal text-sidebar-foreground/70">
                          {item.description}
                        </span>
                      </span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Customize</SidebarGroupLabel>
            <SidebarMenu>
              {APP_CTA_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.description}
                    onClick={() => {
                      if (item.href === "#appearance") {
                        window.dispatchEvent(new CustomEvent("open-appearance"));
                      } else if (item.href === "#mood") {
                        window.dispatchEvent(new CustomEvent("open-mood"));
                      }
                    }}
                  >
                    <button
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      <span className="flex size-6 items-center justify-center rounded-md bg-sidebar-accent-foreground/10 text-sidebar-accent-foreground">
                        {item.icon}
                      </span>
                      <span className="flex flex-col leading-tight">
                        {item.label}
                        <span className="text-xs font-normal text-sidebar-foreground/70">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Developer</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Theme toggle (demo)"
                  onClick={() => toast.success("Theme picker coming soon")}
                >
                  <button
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <span className="flex size-6 items-center justify-center rounded-md bg-sidebar-accent-foreground/10 text-sidebar-accent-foreground">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
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
                    </span>
                    <span className="flex flex-col leading-tight">
                      Theme
                      <span className="text-xs font-normal text-sidebar-foreground/70">
                        Light / Dark
                      </span>
                    </span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t px-4 py-3">
          <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/30 px-3 py-2 text-sm text-sidebar-foreground">
            <div className="flex size-8 items-center justify-center rounded-full bg-sidebar-accent-foreground/10 text-sidebar-accent-foreground text-xs font-semibold">
              {user?.email?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="truncate text-xs font-medium">{user?.email ?? "User"}</span>
              <span className="text-[10px] text-sidebar-foreground/70">Signed in</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-7 px-2 text-xs"
                onClick={logout}
              >
                Sign out
              </Button>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Appearance picker modal */}
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

      {/* Mood picker modal */}
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
            <Button variant="outline" size="sm" onClick={() => setMoodOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

const NAV_ICONS: Record<string, React.ReactNode> = {
  "/dashboard": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  "/dashboard/album": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  ),
  "/dashboard/notes": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  "/dashboard/memories": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
};

function UserMenu({
  user,
  billingAccount,
  logout,
  clearConversation,
}: {
  user: NonNullableUser | null;
  billingAccount: unknown;
  logout: () => void;
  clearConversation: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const avatar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (avatar.current && !avatar.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const account = user ?? undefined;

  return (
    <div ref={avatar} className="relative">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="flex size-9 items-center justify-center rounded-full ring-2 ring-border ring-offset-2 ring-offset-background text-muted-foreground hover:text-foreground hover:ring-foreground transition-colors"
            type="button"
          >
            {account?.image ? (
              <img
                src={account.image}
                alt={account.email ?? undefined}
                className="size-9 rounded-full object-cover"
              />
            ) : (
              <span className="text-sm font-semibold">
                {account?.email?.[0]?.toUpperCase() ?? account?.name?.[0]?.toUpperCase() ?? "?"}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
            <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold">
              {account?.email?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="truncate text-xs font-medium text-foreground">
                {account?.name ?? account?.email ?? "User"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {account?.email ?? "Not signed in"}
              </span>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              navigate("/dashboard/settings");
              setOpen(false);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 mr-2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open-appearance"));
              setOpen(false);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 mr-2">
              <circle cx="12" cy="8" r="4" />
              <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
              <path d="M12 13v4" />
              <path d="M9 17h6" />
            </svg>
            How she looks
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open-mood"));
              setOpen(false);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 mr-2">
              <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
              <path d="M8 20c0-2 2-3.5 4-3.5s4 1.5 4 3.5" />
            </svg>
            Change mood
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={clearConversation}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 mr-2">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
            Clear conversation
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} className="text-destructive">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 mr-2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function NavCta({
  label,
  href,
  description,
  icon,
}: {
  label: string;
  href: string;
  description: string;
  icon: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      className="group relative flex items-start gap-3 rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border hover:shadow-sm hover:bg-card/90"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(href)}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
          hovered
            ? "bg-muted text-foreground"
            : "bg-muted/60 text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span
        className={cn(
          "pointer-events-none absolute right-4 top-4 flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform",
          hovered && "translate-x-1 translate-y-1",
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </span>
    </button>
  );
}
