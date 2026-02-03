import { Panel } from "../components/Panel";
import { Button } from "../components/Button";

type LobbyData = {
  roomCode: string;
  gameName: string;
  players: Array<{ name: string; connected: boolean; ready: boolean }>;
};

export function LobbyPlayerScreen({ data }: { data: LobbyData }) {
  return (
    <Panel title="Player Lobby">
      <div className="glass" style={{ marginBottom: 12 }}>
        <p className="eyebrow">Room</p>
        <h2 style={{ margin: 0, color: "#f8fafc" }}>{data.roomCode}</h2>
        <p className="lede">{data.gameName}</p>
      </div>
      <div className="glass" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 8px", color: "#f8fafc" }}>Players</h3>
        <div className="form-grid">
          {data.players.map((player) => (
            <div key={player.name} className="glass" style={{ padding: 12 }}>
              <strong>{player.name}</strong>
              <div className="lede">
                {player.connected ? "Connected" : "Disconnected"} · {player.ready ? "Ready" : "Not ready"}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="cta-row">
        <Button>Ready</Button>
        <Button variant="ghost">Leave</Button>
      </div>
    </Panel>
  );
}
