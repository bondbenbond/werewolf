import { Panel } from "../components/Panel";
import { Button } from "../components/Button";

type RevealData = {
  eliminated: string;
  winners: string;
};

export function RevealScreen({ data, isHost }: { data: RevealData; isHost?: boolean }) {
  return (
    <>
      <Panel title="Reveal">
        <div className="glass" style={{ marginBottom: 12 }}>
          <p className="eyebrow">Eliminated</p>
          <h2 style={{ margin: 0, color: "#f8fafc" }}>{data.eliminated}</h2>
        </div>
        <div className="glass" style={{ marginBottom: 12 }}>
          <p className="eyebrow">Winners</p>
          <h2 style={{ margin: 0, color: "#f8fafc" }}>{data.winners}</h2>
        </div>
        <div className="cta-row">
          <Button>Rematch</Button>
          <Button variant="ghost">New game</Button>
        </div>
      </Panel>
      {isHost ? (
        <div className="host-bar">
          <Button size="small" variant="success">
            Rematch
          </Button>
          <Button size="small" variant="ghost">
            New game
          </Button>
        </div>
      ) : null}
    </>
  );
}
