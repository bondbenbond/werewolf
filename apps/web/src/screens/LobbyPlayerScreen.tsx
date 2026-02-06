import { Button } from "../components/Button";

type LobbyData = {
  roomCode: string;
  gameName?: string;
  shareUrl: string;
  roles: Array<{ name: string; count: number }>;
  settings: {
    nightStepSeconds: number;
    discussionSeconds: number;
    votingSeconds: number;
  };
  players: Array<{ name: string; connected: boolean; ready: boolean; host?: boolean }>;
  startCountdownSeconds?: number | null;
  showCountdownOverlay?: boolean;
};

export function LobbyPlayerScreen({ data }: { data: LobbyData }) {
  const roleTotal = data.roles.reduce((sum, role) => sum + role.count, 0);
  const rolesRequired = data.players.length + 3;
  return (
    <div className="lobby-shell">
      <div className="lobby-header">
        <div>
          <p className="eyebrow">Lobby</p>
          <h2>Room {data.roomCode}</h2>
          <p className="lede">{data.gameName || "Waiting for the host to start the game."}</p>
        </div>
        <div className="lobby-actions">
          <button
            className="room-copy"
            type="button"
            onClick={() => navigator.clipboard?.writeText(data.shareUrl)}
          >
            Copy link
          </button>
        </div>
      </div>

      <div className="settings-summary">
        <span>Role timer: {data.settings.nightStepSeconds}s</span>
        <span>Discussion: {Math.round(data.settings.discussionSeconds / 60)}m</span>
        <span>Vote: {data.settings.votingSeconds}s</span>
      </div>

      <div className="lobby-grid">
        <section className="lobby-section">
          <div className="section-header">
            <h3>Roles</h3>
            <div className="summary-row">
              <span className="summary-pill">Players: {data.players.length}</span>
              <span className="summary-pill">
                Roles: {roleTotal}/{rolesRequired}
              </span>
            </div>
          </div>
          <div className="role-chip-grid">
            {data.roles.map((role) => (
              <div key={role.name} className="role-chip readonly">
                <div className="role-chip-info">
                  <span>{role.name}</span>
                </div>
                <span className="role-chip-count">{role.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="lobby-section">
          <div className="section-header">
            <h3>Players</h3>
          </div>
          <div className="players-list">
            {data.players.map((player) => (
              <div key={player.name} className="player-row">
                <div>
                  <strong>
                    {player.name}
                    {player.host ? <span className="host-badge">Host</span> : null}
                  </strong>
                  <div className="micro">
                    {player.connected ? "Online" : "Offline"} ·{" "}
                    <span className={`ready-status ${player.ready ? "ready" : "waiting"}`}>
                      {player.ready ? "Ready" : "Not ready"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="player-ready-cta">
            <Button variant="success">Ready</Button>
            <Button variant="ghost">Leave</Button>
          </div>
        </section>
      </div>

      {typeof data.startCountdownSeconds === "number" && data.showCountdownOverlay !== false ? (
        <div className="overlay">
          <div className="overlay-card countdown-card">
            <p className="eyebrow">Game starting</p>
            <h3>Host started the game</h3>
            <p className="lede">Starting in {data.startCountdownSeconds}s</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
