import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="
        inline-flex h-8 w-8 items-center justify-center rounded-full
        border border-black/10 bg-white text-zinc-700
        shadow-sm transition
        hover:bg-black/4
        focus:outline-none focus:ring-2 focus:ring-black/10

        dark:ring-1 dark:ring-white/10
        dark:border-white/10 dark:bg-white/5 dark:text-white/80
        dark:hover:bg-white/10 dark:focus:ring-white/10
      "
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
