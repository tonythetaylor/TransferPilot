import * as React from "react";

type Tone = "neutral" | "good" | "warn" | "bad";

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const styles: Record<Tone, string> = {
    neutral: `
      bg-black/[0.05] text-zinc-700 border-black/10
      dark:bg-white/10 dark:text-white/80 dark:border-white/10
    `,
    good: `
      bg-emerald-500/15 text-emerald-700 border-emerald-500/20
      dark:text-emerald-200
    `,
    warn: `
      bg-amber-500/15 text-amber-700 border-amber-500/20
      dark:text-amber-200
    `,
    bad: `
      bg-red-500/15 text-red-700 border-red-500/20
      dark:text-red-200
    `,
  };

  return (
    <span
      className={`
        inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium
        ${styles[tone]}
      `}
    >
      {children}
    </span>
  );
}