import { ReactNode } from "react";

export function Button({
  children,
  variant = "primary",
  size,
}: {
  children: ReactNode;
  variant?: "primary" | "ghost";
  size?: "small" | "tiny";
}) {
  const className = ["button", variant, size].filter(Boolean).join(" ");
  return <button className={className}>{children}</button>;
}
