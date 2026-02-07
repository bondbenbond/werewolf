import { useState } from "react";
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
  players: Array<{ playerId?: string; name: string; connected: boolean; ready: boolean; host?: boolean }>;
  startCountdownSeconds?: number | null;
  showCountdownOverlay?: boolean;
};

type LobbyPlayerScreenProps = {
  data: LobbyData;
  currentPlayerId?: string;
  onSetReady?: (ready: boolean) => void;
  onLeave?: () => void;
};

export function LobbyPlayerScreen({ data, currentPlayerId, onSetReady, onLeave }: LobbyPlayerScreenProps) {
  const roleTotal = data.roles.reduce((sum, role) => sum + role.count, 0);
  const rolesRequired = data.players.length + 3;
  const currentPlayer = currentPlayerId
    ? data.players.find((player) => player.playerId === currentPlayerId)
    : undefined;
  const isReady = currentPlayer?.ready ?? false;
  const shareUrl = data.shareUrl || `${window.location.origin}/?game=${data.roomCode}`;
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const copyLink = () => {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1400);
    } catch {
      setCopyStatus("idle");
    }
  };
  return (
    <div className="lobby-shell">
      <div className="lobby-header">
        <div>
          <p className="eyebrow">Lobby</p>
          <h2>Room {data.roomCode}</h2>
          <p className="lede">
            Waiting on the host to start the game.
          </p>
        </div>
        <div className="lobby-actions">
          <button
            className="room-copy"
            type="button"
            onClick={copyLink}
          >
            {copyStatus === "copied" ? "Copied!" : "Copy link"}
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
              <div key={player.playerId ?? player.name} className="player-row">
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
            <Button variant="success" onClick={() => onSetReady?.(!isReady)} disabled={!onSetReady}>
              {isReady ? "Unready" : "Ready"}
            </Button>
            <Button variant="ghost" onClick={() => onLeave?.()} disabled={!onLeave}>
              Leave
            </Button>
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
