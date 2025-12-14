import * as React from "react";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-xl px-3 py-2 text-sm border " +
        "bg-white text-black border-black/10 placeholder:text-black/40 " +
        "focus:outline-none focus:ring-2 focus:ring-black/10 " +
        "dark:bg-black/30 dark:text-white dark:border-white/10 dark:placeholder:text-white/40 dark:focus:ring-white/10 " +
        (props.className ?? "")
      }
    />
  );
}