import { Panel } from "../components/Panel";
import { Button } from "../components/Button";

type NightData = {
  step: string;
  instruction: string;
  remaining: string;
};

export function NightScreen({ data }: { data: NightData }) {
  return (
    <Panel title="Night Phase">
      <div className="glass" style={{ marginBottom: 12 }}>
        <p className="eyebrow">Current step</p>
        <h2 style={{ margin: 0, color: "#f8fafc" }}>{data.step}</h2>
        <p className="lede">{data.instruction}</p>
        <p className="lede">{data.remaining}</p>
      </div>
      <div className="cta-row">
        <Button>Advance</Button>
        <Button variant="ghost">Nudge</Button>
      </div>
    </Panel>
  );
}
