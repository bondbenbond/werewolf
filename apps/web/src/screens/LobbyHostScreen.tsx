import { Button } from "../components/Button";
import { useMemo, useState } from "react";

type LobbyData = {
  roomCode: string;
  gameName?: string;
  shareUrl: string;
  players: Array<{ playerId?: string; name: string; connected: boolean; ready: boolean; host?: boolean }>;
  roles: Array<{ name: string; count: number }>;
  settings: {
    autoAdvance: boolean;
    parallelNight: boolean;
    nightStepSeconds: number;
    parallelResultSeconds: number;
    discussionSeconds: number;
    votingSeconds: number;
  };
  startCountdownSeconds?: number | null;
  showCountdownOverlay?: boolean;
};

type LobbyHostScreenProps = {
  data: LobbyData;
  onRolesChange?: (roles: string[]) => void;
  onSaveSettings?: (settings: {
    autoAdvance: boolean;
    parallelNight: boolean;
    nightStepSeconds: number;
    parallelResultSeconds: number;
    discussionSeconds: number;
    votingSeconds: number;
  }) => void;
  onStartGame?: () => void;
  onEndGame?: () => void;
  onKickPlayer?: (playerId: string) => void;
};

export function LobbyHostScreen({
  data,
  onRolesChange,
  onSaveSettings,
  onStartGame,
  onEndGame,
  onKickPlayer,
}: LobbyHostScreenProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeHelp, setActiveHelp] = useState<string | null>(null);
  const [savedSettings, setSavedSettings] = useState(data.settings);
  const [settings, setSettings] = useState(data.settings);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [startLoading, setStartLoading] = useState(false);
  const [endLoading, setEndLoading] = useState(false);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>(
    Object.fromEntries(data.roles.map((role) => [role.name, role.count]))
  );
  const pairedRoles = useMemo(() => new Set(["Werewolf", "Mason"]), []);
  const roleMax: Record<string, number> = {
    Villager: 3,
    Werewolf: 2,
    Mason: 2,
  };
  const isMaxed = (state: Record<string, number>) => {
    const total = data.roles.reduce((sum, role) => sum + (state[role.name] ?? 0), 0);
    return total >= rolesRequired;
  };
  const cycleRole = (name: string) => {
    setRoleCounts((prev) => {
      const step = pairedRoles.has(name) ? 2 : 1;
      const max = roleMax[name] ?? 1;
      const current = prev[name] ?? 0;
      const total = data.roles.reduce((sum, role) => sum + (prev[role.name] ?? 0), 0);
      const required = rolesRequired;
      const next = current + step > max ? 0 : current + step;
      if (next > current && total + step > required) return prev;
      if (next === current) return prev;
      const updated = { ...prev, [name]: next };
      if (onRolesChange) {
        const roles: string[] = [];
        data.roles.forEach((role) => {
          const count = updated[role.name] ?? 0;
          for (let i = 0; i < count; i += 1) {
            roles.push(role.name);
          }
        });
        onRolesChange(roles);
      }
      return updated;
    });
  };
  const roleTotal = data.roles.reduce((sum, role) => sum + (roleCounts[role.name] ?? 0), 0);
  const rolesRequired = data.players.length + 3;
  const rolesComplete = roleTotal === rolesRequired;
  const roleTimerOptions = [5, 10, 15, 20, 25, 30];
  const discussionMinuteOptions = [2, 3, 4, 5, 6, 8, 10, 12, 15];
  const shareUrl = data.shareUrl || `${window.location.origin}/?game=${data.roomCode}`;
  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
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
  const settingsDirty =
    settings.autoAdvance !== savedSettings.autoAdvance ||
    settings.parallelNight !== savedSettings.parallelNight ||
    settings.nightStepSeconds !== savedSettings.nightStepSeconds ||
    settings.parallelResultSeconds !== savedSettings.parallelResultSeconds ||
    settings.discussionSeconds !== savedSettings.discussionSeconds ||
    settings.votingSeconds !== savedSettings.votingSeconds;
  const openSettings = () => {
    setSettings(savedSettings);
    setActiveHelp(null);
    setSettingsOpen(true);
  };
  const closeSettings = () => {
    if (settingsDirty) {
      const confirmClose = window.confirm("Discard unsaved changes?");
      if (!confirmClose) return;
    }
    setActiveHelp(null);
    setSettingsOpen(false);
    setSettings(savedSettings);
  };
  const saveSettings = () => {
    setSavedSettings(settings);
    setActiveHelp(null);
    setSettingsOpen(false);
    onSaveSettings?.(settings);
  };
  return (
    <div className="lobby-shell">
      <div className="lobby-header">
        <div>
          <p className="eyebrow">Lobby</p>
          <h2>Room {data.roomCode}</h2>
          <p className="lede">Pick the deck and start when everyone is ready.</p>
        </div>
        <div className="lobby-actions">
          <button className="room-copy" type="button" onClick={copyLink}>
            {copyStatus === "copied" ? "Copied!" : "Copy link"}
          </button>
          <button className="settings-button" type="button" onClick={openSettings}>
            Game settings
          </button>
        </div>
      </div>

      <div className="settings-summary">
        <span>Role timer: {savedSettings.nightStepSeconds}s</span>
        <span>Night results: {savedSettings.parallelResultSeconds}s</span>
        <span>Discussion: {Math.round(savedSettings.discussionSeconds / 60)}m</span>
        <span>Vote: {savedSettings.votingSeconds}s</span>
      </div>

      <div className="lobby-grid">
        <section className="lobby-section">
          <div className="section-header">
            <h3>Roles</h3>
            <div className="summary-row">
              <span className="summary-pill">Players: {data.players.length}</span>
              <span className={`summary-pill ${rolesComplete ? "complete" : ""}`}>
                Roles: {roleTotal}/{rolesRequired}
              </span>
            </div>
          </div>
          <p className="micro">Tap a role to cycle counts.</p>
          <div className="role-chip-grid">
            {data.roles.map((role) => {
              const maxed = isMaxed(roleCounts);
              const count = roleCounts[role.name] ?? 0;
              const disabled = maxed && count === 0;
              return (
                <button
                  key={role.name}
                  type="button"
                  className={`role-chip ${disabled ? "disabled" : ""}`}
                  onClick={() => cycleRole(role.name)}
                  disabled={disabled}
                >
                  <div className="role-chip-info">
                    <span>{role.name}</span>
                    {pairedRoles.has(role.name) ? <span className="role-pair">×2</span> : null}
                  </div>
                  <span className="role-chip-count">{count}</span>
                </button>
              );
            })}
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
                <div className="player-actions">
                  <button
                    className="kick-button"
                    type="button"
                    onClick={() => {
                      if (player.playerId) {
                        onKickPlayer?.(player.playerId);
                      }
                    }}
                    disabled={!onKickPlayer || !player.playerId || player.host}
                  >
                    Kick
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="host-bar lobby-bottom-bar">
        <Button
          size="small"
          variant="success"
          loading={startLoading}
          disabled={!rolesComplete || !onStartGame}
          onClick={async () => {
            if (!onStartGame || startLoading) return;
            setStartLoading(true);
            try {
              await Promise.resolve(onStartGame());
            } finally {
              setStartLoading(false);
            }
          }}
        >
          Start game
        </Button>
        <Button
          size="small"
          variant="ghost"
          loading={endLoading}
          onClick={async () => {
            if (!onEndGame || endLoading) return;
            setEndLoading(true);
            try {
              await Promise.resolve(onEndGame());
            } finally {
              setEndLoading(false);
            }
          }}
          disabled={!onEndGame}
        >
          End game
        </Button>
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

      {settingsOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeSettings}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Game settings</h3>
              <button className="modal-close" type="button" onClick={closeSettings}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <div className="toggle-row">
                <span className="settings-label">
                  Auto-advance after deal
                  <span className="help-wrap">
                    <button
                      className="help-icon"
                      type="button"
                      aria-label="Auto-advance night steps help"
                      onClick={() =>
                        setActiveHelp((prev) => (prev === "autoAdvance" ? null : "autoAdvance"))
                      }
                    >
                      ?
                    </button>
                    {activeHelp === "autoAdvance" ? (
                      <span className="help-bubble help-bubble-below">
                        Automatically runs night, discussion, and voting progression after deal.
                      </span>
                    ) : null}
                  </span>
                </span>
                <button
                  className={`toggle ${settings.autoAdvance ? "on" : ""}`}
                  type="button"
                  onClick={() => setSettings((prev) => ({ ...prev, autoAdvance: !prev.autoAdvance }))}
                  aria-pressed={settings.autoAdvance}
                />
              </div>
              <div className="toggle-row">
                <span className="settings-label">
                  Parallel night
                  <span className="help-wrap">
                    <button
                      className="help-icon"
                      type="button"
                      aria-label="Parallel night help"
                      onClick={() =>
                        setActiveHelp((prev) => (prev === "parallelNight" ? null : "parallelNight"))
                      }
                    >
                      ?
                    </button>
                    {activeHelp === "parallelNight" ? (
                      <span className="help-bubble help-bubble-below">
                        All night roles act at the same time. Players see results after the timer.
                      </span>
                    ) : null}
                  </span>
                </span>
                <button
                  className={`toggle ${settings.parallelNight ? "on" : ""}`}
                  type="button"
                  onClick={() => setSettings((prev) => ({ ...prev, parallelNight: !prev.parallelNight }))}
                  aria-pressed={settings.parallelNight}
                />
              </div>
              <div className="settings-grid">
                <label className="settings-field">
                  <span className="settings-label">
                    Role timer
                    <span className="help-wrap">
                      <button
                        className="help-icon"
                        type="button"
                        aria-label="Role timer help"
                        onClick={() => setActiveHelp((prev) => (prev === "roleTimer" ? null : "roleTimer"))}
                      >
                        ?
                      </button>
                      {activeHelp === "roleTimer" ? (
                        <span className="help-bubble help-bubble-above">
                          Time allowed for each role to act during night.
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <select
                    className="settings-select"
                    value={settings.nightStepSeconds}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, nightStepSeconds: Number(event.target.value) }))
                    }
                  >
                    {roleTimerOptions.map((value) => (
                      <option key={`role-${value}`} value={value}>
                        {value} sec
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span className="settings-label">
                    Night results timer
                    <span className="help-wrap">
                      <button
                        className="help-icon"
                        type="button"
                        aria-label="Night results timer help"
                        onClick={() =>
                          setActiveHelp((prev) => (prev === "parallelResultTimer" ? null : "parallelResultTimer"))
                        }
                      >
                        ?
                      </button>
                      {activeHelp === "parallelResultTimer" ? (
                        <span className="help-bubble help-bubble-above">
                          How long players can view private results after parallel night resolves.
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <select
                    className="settings-select"
                    value={settings.parallelResultSeconds}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, parallelResultSeconds: Number(event.target.value) }))
                    }
                  >
                    {roleTimerOptions.map((value) => (
                      <option key={`parallel-result-${value}`} value={value}>
                        {value} sec
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span className="settings-label">
                    Discussion timer
                    <span className="help-wrap">
                      <button
                        className="help-icon"
                        type="button"
                        aria-label="Discussion timer help"
                        onClick={() =>
                          setActiveHelp((prev) => (prev === "discussionTimer" ? null : "discussionTimer"))
                        }
                      >
                        ?
                      </button>
                      {activeHelp === "discussionTimer" ? (
                        <span className="help-bubble help-bubble-above">
                          Length of open discussion before voting.
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <select
                    className="settings-select"
                    value={settings.discussionSeconds}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, discussionSeconds: Number(event.target.value) }))
                    }
                  >
                    {discussionMinuteOptions.map((value) => (
                      <option key={`discussion-${value}`} value={value * 60}>
                        {value} min
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span className="settings-label">
                    Voting timer
                    <span className="help-wrap">
                      <button
                        className="help-icon"
                        type="button"
                        aria-label="Voting timer help"
                        onClick={() => setActiveHelp((prev) => (prev === "votingTimer" ? null : "votingTimer"))}
                      >
                        ?
                      </button>
                      {activeHelp === "votingTimer" ? (
                        <span className="help-bubble help-bubble-above">
                          How long players have to submit votes.
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <select
                    className="settings-select"
                    value={settings.votingSeconds}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, votingSeconds: Number(event.target.value) }))
                    }
                  >
                    {roleTimerOptions.map((value) => (
                      <option key={`voting-${value}`} value={value}>
                        {value} sec
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-close" type="button" onClick={closeSettings}>
                Cancel
              </button>
              <Button onClick={saveSettings} disabled={!settingsDirty}>
                Save settings
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
