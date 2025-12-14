import * as React from "react";

/**
 * Base Card
 */
export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = "", ...rest } = props;
  return (
    <div
      className={
        "rounded-2xl border p-4 shadow-sm backdrop-blur " +
        "bg-white text-black border-black/10 " +
        "dark:bg-white/5 dark:text-white dark:border-white/10 " +
        className
      }
      {...rest}
    />
  );
}

/**
 * Card Header
 */
export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = "", ...rest } = props;

  return (
    <div
      className={[
        "flex items-start justify-between gap-3 mb-3",
        className,
      ].join(" ")}
      {...rest}
    />
  );
}

/**
 * Card Title
 */
export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      {...props}
      className={
        "text-base font-semibold text-black dark:text-white " +
        (props.className ?? "")
      }
    />
  );
}


/**
 * Card Subtle Text
 */
export function CardSubtle(
  props: React.HTMLAttributes<HTMLParagraphElement>
) {
  const { className = "", ...rest } = props;

  return (
    <p
      className={[
        "text-sm",
        "text-zinc-600 dark:text-white/60",
        className,
      ].join(" ")}
      {...rest}
    />
  );
}