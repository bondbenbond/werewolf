import { Panel } from "../components/Panel";
import { Button } from "../components/Button";

type VotingData = {
  timer: string;
  votes: Array<{ name: string; count: number }>;
};

export function VotingScreen({ data }: { data: VotingData }) {
  return (
    <Panel title="Voting">
      <div className="glass" style={{ marginBottom: 12 }}>
        <p className="eyebrow">Time remaining</p>
        <h2 style={{ margin: 0, color: "#f8fafc" }}>{data.timer}</h2>
      </div>
      <div className="glass" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 8px", color: "#f8fafc" }}>Live tally</h3>
        <div className="form-grid">
          {data.votes.map((player) => (
            <div key={player.name} className="glass" style={{ padding: 12 }}>
              <strong>{player.name}</strong>
              <div className="lede">Votes: {player.count}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="cta-row">
        <Button>Lock votes</Button>
        <Button variant="ghost">Reveal</Button>
      </div>
    </Panel>
  );
}
