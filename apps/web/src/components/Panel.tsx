import { ReactNode } from "react";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass" style={{ marginBottom: 16 }}>
      <h2 style={{ margin: "0 0 12px", color: "#f8fafc" }}>{title}</h2>
      {children}
    </div>
  );
}
