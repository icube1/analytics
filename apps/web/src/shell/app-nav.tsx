import { NavLink } from "react-router-dom";
import { DataBackupMenu } from "@/components/data-backup-menu";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { to: "/", label: "Выписка", end: true },
  { to: "/resilience", label: "Устойчивость", end: false },
  { to: "/investments", label: "Инвестиции", end: false },
] as const;

export function AppNav() {
  return (
    <nav className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <DataBackupMenu />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
