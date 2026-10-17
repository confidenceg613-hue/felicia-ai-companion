import { Brain, Images, MessageSquare, NotebookPen, Settings as SettingsIcon } from "lucide-react";
import { NavLink, Outlet } from "react-router";

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
  return (
    <div className="flex min-h-svh flex-col">
      {/* The page fills the space above the bar and owns its own scrolling. */}
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
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
                    "flex flex-col items-center gap-1 rounded-full px-3 py-2 text-[10px] tracking-wide transition-all sm:flex-row sm:gap-2 sm:px-4 sm:text-xs",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
                  ].join(" ")
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
