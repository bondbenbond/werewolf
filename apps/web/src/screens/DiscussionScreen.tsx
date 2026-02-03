import { Panel } from "../components/Panel";
import { Button } from "../components/Button";

type DiscussionData = {
  timer: string;
  tokens: Array<{ name: string; tokens: number }>;
};

export function DiscussionScreen({ data }: { data: DiscussionData }) {
  return (
    <Panel title="Discussion">
      <div className="glass" style={{ marginBottom: 12 }}>
        <p className="eyebrow">Time remaining</p>
        <h2 style={{ margin: 0, color: "#f8fafc" }}>{data.timer}</h2>
      </div>
      <div className="glass" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 8px", color: "#f8fafc" }}>Suspicion tokens</h3>
        <div className="form-grid">
          {data.tokens.map((player) => (
            <div key={player.name} className="glass" style={{ padding: 12 }}>
              <strong>{player.name}</strong>
              <div className="lede">Tokens: {player.tokens}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="cta-row">
        <Button>Start voting</Button>
        <Button variant="ghost">Extend</Button>
      </div>
    </Panel>
  );
}
