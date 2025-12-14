import * as React from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
) {
  const { className = "", variant = "primary", disabled, ...rest } = props;

  const base =
    [
      "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
      "focus:outline-none focus:ring-2",
      "disabled:opacity-50 disabled:cursor-not-allowed",
    ].join(" ");

const styles: Record<Variant, string> = {
  primary:
    "bg-black text-white hover:bg-black/90 " +
    "dark:bg-white dark:text-black dark:hover:bg-white/90",

  secondary:
    "bg-black/5 text-black border border-black/10 hover:bg-black/10 " +
    "dark:bg-white/10 dark:text-white dark:border-white/10 dark:hover:bg-white/15",

  danger: "bg-red-500 text-white hover:bg-red-400",
  ghost:
    "bg-transparent text-black hover:bg-black/10 " +
    "dark:text-white dark:hover:bg-white/10",
};

  return (
    <button
      className={`${base} ${styles[variant]} ${className}`}
      disabled={disabled}
      {...rest}
    />
  );
}