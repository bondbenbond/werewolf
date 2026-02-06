import { useMemo, useRef, useState } from "react";
import { HomeScreen } from "../screens/HomeScreen";
import { LobbyHostScreen } from "../screens/LobbyHostScreen";
import { LobbyPlayerScreen } from "../screens/LobbyPlayerScreen";
import { NightScreen } from "../screens/NightScreen";
import { GameScreen } from "../screens/GameScreen";
import { GameBoardScreen, type GameBoardDevHandle } from "../screens/GameBoardScreen";
import { mockData } from "../mocks/mockData";
import { TopBar } from "../components/TopBar";

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

      {screen === "Home" && <HomeScreen />}
      {screen === "LobbyHost" && (
        <LobbyHostScreen
          data={{
            ...data.lobby,
            startCountdownSeconds: lobbyCountdown ?? data.lobby.startCountdownSeconds ?? null,
            showCountdownOverlay: showLobbyCountdown,
          }}
        />
      )}
      {screen === "LobbyPlayer" && (
        <LobbyPlayerScreen
          data={{
            ...data.lobby,
            startCountdownSeconds: lobbyCountdown ?? data.lobby.startCountdownSeconds ?? null,
            showCountdownOverlay: showLobbyCountdown,
          }}
        />
      )}
      {screen === "Game" && (
        <GameScreen
          isHost={hostView}
          data={{
            board: {
              ...data.board,
              phaseSecondsRemaining: dealCountdown ?? data.board.phaseSecondsRemaining,
            },
            phase: gamePhase,
            phaseTimer: dealCountdown !== null ? `${dealCountdown}s` : undefined,
            night: {
              step: data.night.step,
              instruction: data.night.instruction,
              remaining: nightCountdown !== null ? `Night countdown: ${nightCountdown}s` : data.night.remaining,
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
          }}
        />
      )}
    </div>
  );
}
