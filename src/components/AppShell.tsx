import { pageModules, type PageModuleKey } from "@/lib/pageModules";
import { Brain, Images, MessageSquare, NotebookPen, Settings as SettingsIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Suspense, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

/**
 * The signed-in shell: one screen at a time, and a bottom bar to move between
 * them — the navigation every app has, sitting under the thumb.
 *
 * The bar is rendered here rather than in each page so it is always in the same
 * place and never scrolls away with the content above it.
 */
const TABS: {
  to: string;
  label: string;
  Icon: typeof MessageSquare;
  end?: boolean;
  module: PageModuleKey;
}[] = [
  { to: "/dashboard", label: "Chat", Icon: MessageSquare, end: true, module: "dashboard" },
  { to: "/dashboard/album", label: "Album", Icon: Images, module: "album" },
  { to: "/dashboard/memories", label: "Memories", Icon: Brain, module: "memories" },
  { to: "/dashboard/notes", label: "Notes", Icon: NotebookPen, module: "notes" },
  { to: "/dashboard/settings", label: "Settings", Icon: SettingsIcon, module: "settings" },
];

/** Start pulling a page's code the instant a tab is touched. */
function warm(key: PageModuleKey) {
  void pageModules[key]();
}

/**
 * What a tab shows in the content area while its code is still arriving.
 *
 * The tab bar and the frame stay exactly where they are — a route change reads
 * as a page loading, never as the app disappearing and coming back.
 */
function PageSkeleton() {
  return (
    <div aria-hidden className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-6">
      <div className="h-7 w-32 animate-pulse rounded-full bg-muted/60" />
      <div className="h-16 animate-pulse rounded-2xl bg-muted/40" />
      <div className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="aspect-[2/3] animate-pulse rounded-xl bg-muted/30"
          />
        ))}
      </div>
    </div>
  );
}

export default function AppShell() {
  const location = useLocation();

  // The tab bar is the only way between pages, so once the shell is on screen
  // every tab's code is fetched — a tap then renders a module already in
  // memory instead of waiting on a download.
  useEffect(() => {
    for (const tab of TABS) warm(tab.module);
  }, []);

  return (
    /* A fixed, viewport-tall frame: the bar is a real row at the bottom and
       the page scrolls inside the space above it. Nothing can slide under the
       bar, and the composer always sits exactly on top of it. */
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden">
      {/* The page fills the space above the bar and owns its own scrolling.
          Keyed on the path so every tab opens with a soft rise instead of a
          hard cut — one shared spring, identical on every screen. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Scoped to the page area: the tab bar never unmounts while a route
              is loading, so the app itself never blinks out. */}
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </motion.div>
      </main>

      <nav
        aria-label="Sections"
        className="glass z-30 shrink-0 rounded-none pt-2 pb-[calc(0.55rem+env(safe-area-inset-bottom))] sm:mx-auto sm:mb-3 sm:w-fit sm:rounded-full sm:border-x sm:px-3 sm:pt-0 sm:pb-0"
      >
        {/* Five equal columns on a phone: every tab keeps its own space, so the
            last one can never be pushed off the edge of a narrow screen. */}
        <ul className="grid w-full grid-cols-5 items-center gap-0.5 px-1 sm:flex sm:w-auto sm:justify-center sm:gap-1 sm:px-0">
          {TABS.map(({ to, label, Icon, end, module }) => (
            <li key={to} className="min-w-0">
              <NavLink
                to={to}
                end={end}
                onPointerEnter={() => warm(module)}
                onPointerDown={() => warm(module)}
                onFocus={() => warm(module)}
                className={({ isActive }) =>
                  [
                    "relative flex min-w-0 flex-col items-center gap-1 rounded-full px-1 py-2 text-[10px] leading-none font-medium tracking-wide transition-colors duration-300 ease-[var(--ease-premium)] sm:flex-row sm:gap-2 sm:px-4 sm:text-xs",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    {/* The pill glides between tabs — one shared element, so
                        the active state travels instead of blinking on and off. */}
                    {isActive && (
                      <motion.span
                        layoutId="tab-pill"
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-primary/14 inset-ring-1 inset-ring-primary/25 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 34,
                        }}
                      />
                    )}
                    <motion.span
                      className="relative flex max-w-full items-center gap-1 sm:gap-1.5"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.94 }}
                      transition={{ type: "spring", stiffness: 500, damping: 28 }}
                    >
                      <Icon className="size-4" />
                      {label}
                    </motion.span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}