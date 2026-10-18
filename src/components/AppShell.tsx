import { Brain, Images, MessageSquare, NotebookPen, Settings as SettingsIcon } from "lucide-react";
import { motion } from "framer-motion";
import { NavLink, Outlet, useLocation } from "react-router";

/**
 * The signed-in shell: one screen at a time, and a bottom bar to move between
 * them — the navigation every app has, sitting under the thumb.
 *
 * The bar is rendered here rather than in each page so it is always in the same
 * place and never scrolls away with the content above it.
 */
const TABS = [
  { to: "/dashboard", label: "Chat", Icon: MessageSquare, end: true },
  { to: "/dashboard/album", label: "Album", Icon: Images },
  { to: "/dashboard/memories", label: "Memories", Icon: Brain },
  { to: "/dashboard/notes", label: "Notes", Icon: NotebookPen },
  { to: "/dashboard/settings", label: "Settings", Icon: SettingsIcon },
];

export default function AppShell() {
  const location = useLocation();

  return (
    <div className="flex min-h-svh flex-col">
      {/* The page fills the space above the bar and owns its own scrolling.
          Keyed on the path so every tab opens with a soft rise instead of a
          hard cut — one shared spring, identical on every screen. */}
      <main className="flex min-h-0 flex-1 flex-col">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <Outlet />
        </motion.div>
      </main>

      <nav
        aria-label="Sections"
        className="glass sticky bottom-0 z-30 shrink-0 rounded-none border-x-0 border-b-0 px-2 py-1.5 sm:mx-auto sm:mb-3 sm:w-fit sm:rounded-full sm:border-x sm:px-3"
      >
        <ul className="flex items-center justify-between gap-1">
          {TABS.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    "relative flex flex-col items-center gap-1 rounded-full px-3 py-2 text-[10px] tracking-wide transition-colors sm:flex-row sm:gap-2 sm:px-4 sm:text-xs",
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
                        className="absolute inset-0 rounded-full bg-primary/15"
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 34,
                        }}
                      />
                    )}
                    <motion.span
                      className="relative flex items-center gap-1.5"
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