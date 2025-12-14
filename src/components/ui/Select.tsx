import * as React from "react";

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    options: { label: string; value: string }[];
  }
) {
  const { className = "", options, ...rest } = props;

  return (
    <select
      className={`
        w-full rounded-xl px-3 py-2 text-sm transition
        focus:outline-none focus:ring-2

        /* Light mode */
        bg-black/3 text-zinc-900 border border-black/10
        focus:ring-black/10

        /* Dark mode */
        dark:bg-white/5 dark:text-white dark:border-white/10
        dark:focus:ring-white/10

        ${className}
      `}
      {...rest}
    >
      {options.map((o) => (
        <option
          key={o.value}
          value={o.value}
          className="
            bg-zinc-50 text-zinc-900
            dark:bg-zinc-950 dark:text-white
          "
        >
          {o.label}
        </option>
      ))}
    </select>
  );
}