import { ReactNode, ButtonHTMLAttributes } from "react";

export function Button({
  children,
  variant = "primary",
  size,
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "success";
  size?: "small" | "tiny";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const className = ["button", variant, size].filter(Boolean).join(" ");
  return (
    <button className={className} {...props}>
      {children}
    </button>
  );
}
