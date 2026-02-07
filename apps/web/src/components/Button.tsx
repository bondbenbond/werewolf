import { ReactNode, ButtonHTMLAttributes } from "react";

export function Button({
  children,
  variant = "primary",
  size,
  loading = false,
  disabled,
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "success";
  size?: "small" | "tiny";
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const className = ["button", variant, size, loading ? "loading" : ""].filter(Boolean).join(" ");
  return (
    <button className={className} disabled={disabled || loading} {...props}>
      <span className="button-content">{children}</span>
      {loading ? <span className="button-spinner" aria-hidden="true" /> : null}
    </button>
  );
}
