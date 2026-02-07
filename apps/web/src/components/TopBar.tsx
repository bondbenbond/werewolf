export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="hero-shell">
      <div className="hero">
        <p className="eyebrow">UI Playground</p>
        <h1>{title}</h1>
        {subtitle ? <p className="lede">{subtitle}</p> : null}
      </div>
    </div>
  );
}
