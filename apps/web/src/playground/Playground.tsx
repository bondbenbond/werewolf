import { useEffect, useMemo, useRef, useState } from "react";
import { HomeScreen } from "../screens/HomeScreen";
import { LobbyHostScreen } from "../screens/LobbyHostScreen";
import { LobbyPlayerScreen } from "../screens/LobbyPlayerScreen";
import { NightScreen } from "../screens/NightScreen";
import { GameScreen } from "../screens/GameScreen";
import { GameBoardScreen, type GameBoardDevHandle } from "../screens/GameBoardScreen";
import { mockData } from "../mocks/mockData";
import { TopBar } from "../components/TopBar";
import { useLiveGame } from "../api/useLiveGame";
import { mapGameData, mapLobbyData } from "../api/mappers";
import { clearSession, readSession, type SessionInfo } from "../api/session";
import { useApiEnv } from "../api/ApiContext";
import { sendCommand } from "../api/client";

const screens = ["Home", "LobbyHost", "LobbyPlayer", "Game"] as const;

export function Playground() {
  const [screen, setScreen] = useState<(typeof screens)[number]>("Home");
  const [open, setOpen] = useState(false);
  const gameBoardRef = useRef<GameBoardDevHandle>(null);
  const data = useMemo(() => mockData, []);
  const [playerCount, setPlayerCount] = useState(
    data.board.cards.filter((card) => card.type === "player").length
  );
  const [nightCountdown, setNightCountdown] = useState<number | null>(null);
  const [lobbyCountdown, setLobbyCountdown] = useState<number | null>(null);
  const [showLobbyCountdown, setShowLobbyCountdown] = useState(true);
  const [hostView, setHostView] = useState(true);
  const [dealCountdown, setDealCountdown] = useState<number | null>(null);
  const [nightRole, setNightRole] = useState("Werewolf");
  const [nightWaiting, setNightWaiting] = useState(false);
  const [nightActionModal, setNightActionModal] = useState(false);
  const [nightActionActive, setNightActionActive] = useState(false);
  const [gamePhase, setGamePhase] = useState<"deal" | "night" | "discussion" | "voting" | "reveal">("deal");
  const initialSession = useMemo(() => readSession(), []);
  const [useLive, setUseLive] = useState(!!initialSession);
  const [followPhase, setFollowPhase] = useState(true);
  const [liveGameId, setLiveGameId] = useState(initialSession?.gameId ?? "");
  const [livePlayerId, setLivePlayerId] = useState(initialSession?.playerId ?? "");
  const [liveSecret, setLiveSecret] = useState(initialSession?.secret ?? "");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [commandError, setCommandError] = useState<string | null>(null);
  const env = useApiEnv();
  const live = useLiveGame({
    enabled: useLive && liveGameId.trim().length > 0,
    gameId: liveGameId.trim(),
    playerId: livePlayerId.trim() || undefined,
    secret: liveSecret.trim() || undefined,
  });
  const liveState = live.snapshot?.state;
  const liveLobby = liveState ? mapLobbyData(liveState, liveGameId.trim()) : null;
  const liveGame = liveState ? mapGameData(liveState, live.snapshot?.private, livePlayerId.trim()) : null;
  const livePhase = liveState?.phase ?? null;
  const livePhaseRemaining = liveState?.phaseEndsAt
    ? Math.max(0, Math.ceil((liveState.phaseEndsAt - nowMs) / 1000))
    : null;
  const effectiveIsHost =
    useLive && liveState ? liveState.hostPlayerId === livePlayerId.trim() : hostView;
  const resolvedScreen =
    useLive && liveState && followPhase
      ? livePhase === "lobby" || (livePhase === "deal" && (livePhaseRemaining ?? 0) > 0)
        ? effectiveIsHost
          ? "LobbyHost"
          : "LobbyPlayer"
        : "Game"
      : screen;

  const handleSession = (session: SessionInfo) => {
    setUseLive(true);
    setFollowPhase(true);
    setHostView(session.isHost);
    setLiveGameId(session.gameId);
    setLivePlayerId(session.playerId);
    setLiveSecret(session.secret);
  };

  useEffect(() => {
    if (!useLive || !liveState?.phaseEndsAt) return undefined;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [liveState?.phaseEndsAt, useLive]);

  const sendLiveCommand = async (command: { type: string; payload?: Record<string, unknown> }) => {
    if (!useLive || !liveGameId || !livePlayerId || !liveSecret) return;
    try {
      setCommandError(null);
      await sendCommand(env, liveGameId, {
        playerId: livePlayerId,
        secret: liveSecret,
        lastKnownVersion: live.version ?? live.snapshot?.version ?? 0,
        command,
      });
    } catch (error) {
      setCommandError((error as Error).message);
    }
  };

  return (
    <div className="page">
      <div className="playground-menu">
        <button
          className="button ghost tiny"
          type="button"
          onClick={() => setOpen((value) => !value)}
        >
          Dev
        </button>
        {open ? (
          <div className="glass playground-panel">
            <div className="field">
              <label htmlFor="screen">Screen</label>
              <select
                id="screen"
                value={screen}
                onChange={(event) => setScreen(event.target.value as (typeof screens)[number])}
                className="input"
              >
                {screens.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>View mode</label>
              <div className="pill-row">
                <button className="pill small" type="button" onClick={() => setHostView((prev) => !prev)}>
                  {hostView ? "Host view" : "Player view"}
                </button>
              </div>
            </div>
            <div className="field">
              <label>Live server</label>
              <div className="pill-row">
                <button className="pill small" type="button" onClick={() => setUseLive((prev) => !prev)}>
                  {useLive ? "Live data on" : "Live data off"}
                </button>
                <button className="pill small" type="button" onClick={() => setFollowPhase((prev) => !prev)}>
                  {followPhase ? "Follow phase" : "Stay on screen"}
                </button>
              </div>
              <div className="field">
                <label htmlFor="live-game-id">Game ID</label>
                <input
                  id="live-game-id"
                  className="input"
                  value={liveGameId}
                  onChange={(event) => setLiveGameId(event.target.value)}
                  placeholder="game-id"
                />
              </div>
              <div className="field">
                <label htmlFor="live-player-id">Player ID (optional)</label>
                <input
                  id="live-player-id"
                  className="input"
                  value={livePlayerId}
                  onChange={(event) => setLivePlayerId(event.target.value)}
                  placeholder="player-id"
                />
              </div>
              <div className="field">
                <label htmlFor="live-secret">Secret (optional)</label>
                <input
                  id="live-secret"
                  className="input"
                  value={liveSecret}
                  onChange={(event) => setLiveSecret(event.target.value)}
                  placeholder="secret"
                />
              </div>
              {useLive ? (
                <div className="micro">
                  Status: {live.status}
                  {live.error ? ` · ${live.error}` : ""}
                  {commandError ? ` · ${commandError}` : ""}
                </div>
              ) : null}
            </div>
            {screen === "Game" ? (
              <div className="field">
                <label>Game dev</label>
                <div className="pill-row">
                  <button
                    className="pill small"
                    type="button"
                    onClick={() => gameBoardRef.current?.prevRole()}
                  >
                    Prev role
                  </button>
                  <button
                    className="pill small"
                    type="button"
                    onClick={() => gameBoardRef.current?.nextRole()}
                  >
                    Next role
                  </button>
                  <button className="pill small" type="button" onClick={() => gameBoardRef.current?.showRole()}>
                    Show role
                  </button>
                  <button
                    className="pill small"
                    type="button"
                    onClick={() => gameBoardRef.current?.toggleCardsFace()}
                  >
                    Toggle cards
                  </button>
                </div>
                <div className="field">
                  <label htmlFor="player-count">Player cards</label>
                  <select
                    id="player-count"
                    className="input"
                    value={playerCount}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isNaN(value)) {
                        setPlayerCount(value);
                        gameBoardRef.current?.setPlayerCount(value);
                      }
                    }}
                  >
                    {Array.from({ length: 8 }, (_, idx) => idx + 3).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
            {screen === "Game" ? (
              <div className="field">
                <label htmlFor="game-phase">Phase</label>
                <select
                  id="game-phase"
                  className="input"
                  value={gamePhase}
                  onChange={(event) =>
                    setGamePhase(event.target.value as "deal" | "night" | "discussion" | "voting" | "reveal")
                  }
                >
                  {["deal", "night", "discussion", "voting", "reveal"].map((phase) => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {screen === "Game" && gamePhase === "deal" ? (
              <div className="field">
                <label>Deal timer</label>
                <div className="pill-row">
                  <button
                    className="pill small"
                    type="button"
                    onClick={() => {
                      if (dealCountdown !== null) return;
                      let current = 10;
                      setDealCountdown(current);
                      const timer = window.setInterval(() => {
                        current -= 1;
                        if (current <= 0) {
                          window.clearInterval(timer);
                          setDealCountdown(null);
                        } else {
                          setDealCountdown(current);
                        }
                      }, 1000);
                    }}
                  >
                    Start timer
                  </button>
                  <button className="pill small" type="button" onClick={() => setDealCountdown(null)}>
                    Reset
                  </button>
                </div>
              </div>
            ) : null}
            {screen === "LobbyPlayer" || screen === "LobbyHost" ? (
              <div className="field">
                <label>Lobby dev</label>
                <div className="pill-row">
                  <button
                    className="pill small"
                    type="button"
                    onClick={() => {
                      if (lobbyCountdown !== null) return;
                      let current = 10;
                      setLobbyCountdown(current);
                      const timer = window.setInterval(() => {
                        current -= 1;
                        if (current <= 0) {
                          window.clearInterval(timer);
                          setLobbyCountdown(null);
                        } else {
                          setLobbyCountdown(current);
                        }
                      }, 1000);
                    }}
                  >
                    Start lobby countdown
                  </button>
                  <button className="pill small" type="button" onClick={() => setLobbyCountdown(null)}>
                    Reset
                  </button>
                  <button
                    className="pill small"
                    type="button"
                    onClick={() => setShowLobbyCountdown((prev) => !prev)}
                  >
                    {showLobbyCountdown ? "Hide modal" : "Show modal"}
                  </button>
                </div>
              </div>
            ) : null}
            {screen === "Game" && gamePhase === "night" ? (
              <div className="field">
                <label>Night dev</label>
                <div className="pill-row">
                  <button
                    className="pill small"
                    type="button"
                    onClick={() => {
                      if (nightCountdown !== null) return;
                      let current = 10;
                      setNightCountdown(current);
                      const timer = window.setInterval(() => {
                        current -= 1;
                        if (current <= 0) {
                          window.clearInterval(timer);
                          setNightCountdown(null);
                        } else {
                          setNightCountdown(current);
                        }
                      }, 1000);
                    }}
                  >
                    Start countdown
                  </button>
                  <button className="pill small" type="button" onClick={() => setNightCountdown(null)}>
                    Reset
                  </button>
                  <button
                    className="pill small"
                    type="button"
                    onClick={() => {
                      setNightWaiting((prev) => !prev);
                      setNightActionActive(false);
                    }}
                  >
                    {nightWaiting ? "Show action" : "Wait state"}
                  </button>
                  <button
                    className="pill small"
                    type="button"
                    onClick={() => {
                      setNightActionModal((prev) => !prev);
                      setNightActionActive(false);
                    }}
                  >
                    {nightActionModal ? "Hide action" : "Show action"}
                  </button>
                  <button
                    className="pill small"
                    type="button"
                    onClick={() => setNightActionActive(false)}
                  >
                    Reset action
                  </button>
                </div>
                <div className="field">
                  <label htmlFor="night-role">Role</label>
                  <select
                    id="night-role"
                    className="input"
                    value={nightRole}
                    onChange={(event) => setNightRole(event.target.value)}
                  >
                    {[
                      "Werewolf",
                      "Minion",
                      "Mason",
                      "Seer",
                      "Robber",
                      "Troublemaker",
                      "Drunk",
                      "Insomniac",
                      "Doppleganger",
                      "Tanner",
                      "Villager",
                    ].map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {resolvedScreen === "Home" && <HomeScreen onSession={handleSession} />}
      {resolvedScreen === "LobbyHost" && (
        <LobbyHostScreen
          data={{
            ...(liveLobby ?? data.lobby),
            startCountdownSeconds: liveLobby
              ? livePhase === "deal" && (livePhaseRemaining ?? 0) > 0
                ? livePhaseRemaining
                : liveLobby.startCountdownSeconds ?? null
              : lobbyCountdown ?? data.lobby.startCountdownSeconds ?? null,
            showCountdownOverlay: liveLobby ? true : showLobbyCountdown,
          }}
          onRolesChange={
            liveLobby
              ? (roles) => {
                  const normalized = roles.map((role) => role.toLowerCase());
                  sendLiveCommand({ type: "UPDATE_ROLES", payload: { roles: normalized } });
                }
              : undefined
          }
          onSaveSettings={
            liveLobby
              ? (settings) => {
                  const base = liveState?.settings;
                  if (!base) return;
                  sendLiveCommand({
                    type: "UPDATE_SETTINGS",
                    payload: {
                      settings: {
                        ...base,
                        autoAdvanceNight: settings.autoAdvance,
                        parallelNight: settings.parallelNight,
                        discussionSeconds: settings.discussionSeconds,
                      },
                    },
                  });
                }
              : undefined
          }
          onStartGame={liveLobby ? () => sendLiveCommand({ type: "START_GAME" }) : undefined}
          onEndGame={liveLobby ? () => sendLiveCommand({ type: "RESET_GAME" }) : undefined}
          onKickPlayer={
            liveLobby ? (playerId) => sendLiveCommand({ type: "KICK_PLAYER", payload: { playerId } }) : undefined
          }
        />
      )}
      {resolvedScreen === "LobbyPlayer" && (
        <LobbyPlayerScreen
          data={{
            ...(liveLobby ?? data.lobby),
            startCountdownSeconds: liveLobby
              ? livePhase === "deal" && (livePhaseRemaining ?? 0) > 0
                ? livePhaseRemaining
                : liveLobby.startCountdownSeconds ?? null
              : lobbyCountdown ?? data.lobby.startCountdownSeconds ?? null,
            showCountdownOverlay: liveLobby ? true : showLobbyCountdown,
          }}
          currentPlayerId={liveLobby ? livePlayerId : undefined}
          onSetReady={liveLobby ? (ready) => sendLiveCommand({ type: "SET_READY", payload: { ready } }) : undefined}
          onLeave={
            liveLobby
              ? () => {
                  sendLiveCommand({ type: "LEAVE_GAME" }).finally(() => {
                    clearSession();
                    window.location.href = "/";
                  });
                }
              : undefined
          }
        />
      )}
      {resolvedScreen === "Game" && (
        <GameScreen
          isHost={effectiveIsHost}
          interactive={!liveGame}
          discussionTokensByCard={liveGame?.discussionTokensByCard}
          voteCountsByCard={liveGame?.voteCountsByCard}
          onAckRole={liveGame ? () => sendLiveCommand({ type: "ACK_ROLE" }) : undefined}
          onStartNight={liveGame ? () => sendLiveCommand({ type: "START_NIGHT" }) : undefined}
          onAdvanceNightStep={
            liveGame ? () => sendLiveCommand({ type: "ADVANCE_NIGHT_STEP" }) : undefined
          }
          onStartVoting={liveGame ? () => sendLiveCommand({ type: "START_VOTING" }) : undefined}
          onRevealResults={liveGame ? () => sendLiveCommand({ type: "REVEAL_RESULTS" }) : undefined}
          onEndGame={liveGame ? () => sendLiveCommand({ type: "RESET_GAME" }) : undefined}
          onSubmitVote={
            liveGame ? (targetPlayerId) => sendLiveCommand({ type: "SUBMIT_VOTE", payload: { targetPlayerId } }) : undefined
          }
          onPlaceToken={
            liveGame
              ? (targetId, role) =>
                  role
                    ? sendLiveCommand({
                        type: "PLACE_TOKEN",
                        payload: { targetId, role: role.toLowerCase() },
                      })
                    : sendLiveCommand({ type: "REMOVE_TOKEN", payload: { targetId } })
              : undefined
          }
          onNightAction={
            liveGame
              ? (payload) =>
                  sendLiveCommand({
                    type: "NIGHT_ACTION",
                    payload,
                  })
              : undefined
          }
          data={
            liveGame
              ? liveGame.data
              : {
                  board: {
                    ...data.board,
                    phaseSecondsRemaining: dealCountdown ?? data.board.phaseSecondsRemaining,
                  },
                  phase: gamePhase,
                  phaseTimer: dealCountdown !== null ? `${dealCountdown}s` : undefined,
                  night: {
                    step: data.night.step,
                    instruction: data.night.instruction,
                    remaining:
                      nightCountdown !== null ? `Night countdown: ${nightCountdown}s` : data.night.remaining,
                    role: nightRole,
                    roleInstruction:
                      nightRole === "Werewolf"
                        ? "Look for other werewolves. If alone, you may peek one center card."
                        : nightRole === "Minion"
                        ? "See the werewolves, then close your eyes."
                        : nightRole === "Mason"
                        ? "Look for the other mason."
                        : nightRole === "Seer"
                        ? "View one player or two center cards."
                        : nightRole === "Robber"
                        ? "Swap with a player and view your new role."
                        : nightRole === "Troublemaker"
                        ? "Swap two other players."
                        : nightRole === "Drunk"
                        ? "Swap with a center card without looking."
                        : nightRole === "Insomniac"
                        ? "Peek your card at the end of night."
                        : nightRole === "Doppleganger"
                        ? "Copy another role, then perform that action."
                        : nightRole === "Tanner"
                        ? "Try to get yourself eliminated."
                        : "No action. Keep eyes closed.",
                    waiting: nightWaiting,
                  },
                  discussion: data.discussion,
                  voting: data.voting,
                  reveal: data.reveal,
                }
          }
        />
      )}
    </div>
  );
}
