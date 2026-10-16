import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { FELICIA, FELICIA_AVATAR_URL } from "@/lib/felicia";

import { THEME_OPTIONS, useTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  Brain,
  Images,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  NotebookPen,
  Settings,
  Sun,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";

/**
 * The shell every signed-in screen sits inside.
 *
 * Arranged the way a companion app is: one persistent column on the left that
 * holds the companion and the destinations, and a single main pane that swaps
 * between them — rather than a marketing-style header over a card grid.
 */

const NAV = [
  { to: "/dashboard", label: "Chat", icon: MessageCircle, end: true },
  { to: "/dashboard/memories", label: "Mind map", icon: Brain, end: false },
  { to: "/dashboard/album", label: "Album", icon: Images, end: false },
  { to: "/dashboard/notes", label: "Shared Notes", icon: NotebookPen, end: false },
  { to: "/dashboard/settings", label: "Settings", icon: Settings, end: false },
] as const;

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                {item.label}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  if (compact) {
    const isDark = theme === "dark";
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-3 text-muted-foreground"
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        {isDark ? "Light theme" : "Dark theme"}
      </Button>
    );
  }

  return (
    <div className="flex rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-0.5">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.hint}
          onClick={() => setTheme(option.value as Theme)}
          className={cn(
            "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
            theme === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label === "Match my device" ? "Auto" : option.label}
        </button>
      ))}
    </div>
  );
}

function CompanionCard() {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="relative shrink-0">
        <img
          src={FELICIA_AVATAR_URL}
          alt={FELICIA.name}
          className="size-10 rounded-full border border-border/60 object-cover"
        />
        <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-sidebar bg-emerald-400" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{FELICIA.name}</p>
        <p className="truncate text-xs text-muted-foreground">Online now</p>
      </div>
    </div>
  );
}

/**
 * The companion card's portrait is a permanent asset, so it is loaded once and
 * shown whether or not the voice call or the chat is active.
 */
CompanionCard.displayName = "CompanionCard";

export default function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  const label =
    (typeof user?.name === "string" && user.name) ||
    (typeof user?.email === "string" ? user.email : "") ||
    "Your account";

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* ------------------------------------------------------- desktop rail */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/50 bg-sidebar px-3 py-5 lg:flex">
        <div className="px-2">
          <p className="font-display text-lg leading-none font-semibold tracking-tight">
            {FELICIA.name}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Your companion in Lisbon
          </p>
        </div>

        <div className="mt-5">
          <CompanionCard />
        </div>

        <Separator className="my-5 bg-sidebar-border" />

        <div className="flex-1 overflow-y-auto">
          <p className="px-3 pb-2 text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase">
            Browse
          </p>
          <NavItems />
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p className="px-3 pb-2 text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase">
              Theme
            </p>
            <ThemePicker />
          </div>

          <Separator className="bg-sidebar-border" />

          <div className="px-1">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full justify-start gap-3 text-muted-foreground"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------ main pane */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-border/50 bg-sidebar px-4 py-3 lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar">
              <SheetHeader>
                <SheetTitle className="font-display text-lg">
                  {FELICIA.name}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-2">
                <CompanionCard />
              </div>
              <Separator className="my-4 bg-sidebar-border" />
              <NavItems onNavigate={() => setMobileOpen(false)} />
              <div className="mt-6 space-y-3">
                <ThemePicker compact />
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-3 text-muted-foreground"
                  onClick={() => void handleSignOut()}
                >
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2.5">
            <img
              src="/felicia/hero.jpg"
              alt=""
              className="size-7 rounded-full border border-border/60 object-cover"
            />
            <span className="font-display text-base font-semibold tracking-tight">
              {FELICIA.name}
            </span>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
