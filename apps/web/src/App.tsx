import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { io, Socket } from "socket.io-client";
import { Phase, PrivateView, Role } from "@werewolf/shared";
import "./index.css";

type PublicPlayer = {
  playerId: string;
  name: string;
  connected: boolean;
  ready: boolean;
  hasVoted?: boolean;
};

type RoomPublicState = {
  phase: Phase;
  gameName?: string;
  maxPlayers: number;
  hostPlayerId: string;
  players: PublicPlayer[];
  roleSelection: Role[];
  settings: {
    discussionSeconds: number;
    allowVoteChanges: boolean;
    anonymousVotes: boolean;
    showActionLogOnReveal: boolean;
    tokensEnabled: boolean;
    tokensPerPlayerLimit: number;
  };
  dealAcks?: Record<string, boolean>;
  night?: {
    stepRole: Role | null;
    completedThisStep: Record<string, boolean>;
    stepIndex: number;
    totalSteps: number;
  };
  tokens?: {
    tokensByPlayer: Record<string, Record<string, number>>;
    suspectRolesByPlayer: Record<string, Record<string, Role>>;
  };
  voting?: {
    locked: boolean;
    tally?: Record<string, number>;
  };
  reveal?: {
    eliminatedPlayerId?: string;
    winners?: "village" | "werewolves";
    finalRoles?: Record<string, Role>;
    centerRoles?: Role[];
  };
};

type GameUpdatePayload = {
  roomCode: string;
  you: {
    playerId: string;
    name: string;
    isHost: boolean;
    connected: boolean;
    ready: boolean;
    originalRole?: Role;
  };
  game: RoomPublicState;
  private?: PrivateView;
};

const createSocket = () =>
  io("http://localhost:4000", {
    transports: ["polling"],
    upgrade: false,
    reconnectionAttempts: 5,
    timeout: 8000,
    autoConnect: false,
  });

function App() {
  const socket = useMemo<Socket>(() => createSocket(), []);
  const [update, setUpdate] = useState<GameUpdatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("connecting");
  const [socketId, setSocketId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [gameName, setGameName] = useState("Weekend Wolves");
  const SESSION_KEY = "werewolf-session";
  const persistSession = (data: { roomCode: string; playerId: string; resumeSecret: string }) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  };
  const loadSession = (): { roomCode: string; playerId: string; resumeSecret: string } | null => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const clearSession = () => localStorage.removeItem(SESSION_KEY);
  const allowedRoles: Role[] = [
    "villager",
    "werewolf",
    "minion",
    "mason",
    "seer",
    "robber",
    "troublemaker",
    "insomniac",
  ];
  const ROLE_CAPS: Record<Role, number> = {
    villager: 3,
    werewolf: 2,
    minion: 1,
    mason: 2,
    seer: 1,
    robber: 1,
    troublemaker: 1,
    insomniac: 1,
  };
  const recommendedCounts: Record<Role, number> = {
    villager: 2,
    werewolf: 2,
    minion: 1,
    mason: 2,
    seer: 1,
    robber: 1,
    troublemaker: 1,
    insomniac: 1,
  };
  const [roleCounts, setRoleCounts] = useState<Record<Role, number>>(recommendedCounts);
  const countsToArray = (counts: Record<Role, number>): Role[] =>
    Object.entries(counts).flatMap(([role, count]) => Array(count).fill(role as Role));

  // Night action selections
  // Night selections now driven by table taps; no manual inputs needed here.
  const [nightCountdown, setNightCountdown] = useState(0);
  const [view, setView] = useState<"home" | "configure" | "game">("home");
  const sessionRef = useRef<{ roomCode: string; playerId: string; resumeSecret: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dealAckedLocal, setDealAckedLocal] = useState(false);
  const [nightPromptOpen, setNightPromptOpen] = useState(true);
  type ActiveAction =
    | { role: "seer"; centerPicks: number[] }
    | { role: "robber" }
    | { role: "troublemaker"; picks: string[] }
    | { role: "werewolf-solo" }
    | { role: "insomniac" }
    | null;
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const [suspectTargetId, setSuspectTargetId] = useState<string | null>(null);
  const nightStepKeyRef = useRef<string | null>(null);
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const cardBackSrc = "/assets/cards/card-back.jpeg";
  const roleImage = (role?: Role) => (role ? `/assets/cards/${role}.jpeg` : undefined);
  const [myCurrentRole, setMyCurrentRole] = useState<Role | undefined>(undefined);
  const [myFaceUp, setMyFaceUp] = useState(true);
  const [viewport, setViewport] = useState({ w: typeof window !== "undefined" ? window.innerWidth : 1200, h: typeof window !== "undefined" ? window.innerHeight : 800 });

  const faceStyle = (role?: Role, face: "up" | "down" = "down") => {
    if (face === "down") {
      return {
        backgroundImage: `url(${cardBackSrc})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    }
    const src = roleImage(role);
    return src
      ? {
          backgroundImage: `url(${src})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : undefined;
  };

  useEffect(() => {
    const session = loadSession();
    if (session) {
      sessionRef.current = session;
      setRoomCode(session.roomCode);
      setView("game");
    }
  }, []);

  useEffect(() => {
    socket.onAny((event, ...args) => {
      console.log("[socket:onAny]", event, ...args);
    });
    socket.on("connect", () => {
      setConnectionStatus("connected");
      setError(null);
      setSocketId(socket.id);
      console.log("[socket] connected", socket.id);
      if (sessionRef.current) {
        socket.emit("session:resume", sessionRef.current, (resp?: { ok: boolean }) => {
          if (resp?.ok) {
            setView("game");
          }
        });
      }
    });
    socket.on("disconnect", (reason) => {
      setConnectionStatus(`disconnected (${reason})`);
      console.log("[socket] disconnected", reason);
    });
    socket.on("connect_error", (err) => {
      setConnectionStatus("connect_error");
      setError(err.message);
      console.error("[socket] connect_error", err);
    });
    socket.on("error", (err: { code?: string; message: string }) => {
      setError(err.message);
      console.error("[socket] error", err);
    });
    socket.on("game:update", (payload: GameUpdatePayload) => {
      setUpdate(payload);
      setError(null);
      console.log("[socket] game:update", payload);
      if (payload.you.playerId && payload.roomCode) {
        const existing = loadSession();
        if (existing?.playerId === payload.you.playerId && existing?.roomCode === payload.roomCode) {
          persistSession(existing);
          sessionRef.current = existing;
        }
      }
    });
    socket.on("game:end", () => {
      clearSession();
      sessionRef.current = null;
      setUpdate(null);
      alert("The host ended the game. Returning to the main menu.");
      setView("home");
    });
    setConnectionStatus(socket.connected ? "connected" : "connecting");
    if (!socket.connected) {
      socket.connect();
    }
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    if (!update?.game.night) return;
    setNightCountdown(10);
    const id = setInterval(() => {
      setNightCountdown((n) => {
        if (n <= 1) {
          clearInterval(id);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [update?.game.night?.stepRole, update?.game.night?.stepIndex]);

  useEffect(() => {
    if (!update?.game.night) {
      setNightCountdown(0);
      setNightPromptOpen(true);
      setActiveAction(null);
      setToast(null);
      setSuspectTargetId(null);
      nightStepKeyRef.current = null;
      setMyFaceUp(true);
      return;
    }
    const key = `${update.game.night.stepRole}-${update.game.night.stepIndex}`;
    if (nightStepKeyRef.current !== key) {
      nightStepKeyRef.current = key;
      setNightPromptOpen(true);
      setActiveAction(null);
      setSuspectTargetId(null);
      setMyFaceUp(false);
    }
  }, [update?.game.night?.stepIndex, update?.game.night?.stepRole, update?.game.night]);

  useEffect(() => {
    // Auto-arm solo werewolf center peek when prompt is dismissed.
    if (!update?.game.night || nightPromptOpen || activeAction) return;
    if (update.game.night.stepRole !== "werewolf") return;
    if (update.you.originalRole !== "werewolf") return;
    const completed = update.game.night.completedThisStep?.[update.you.playerId];
    if (completed) return;
    const soloWolf =
      update.private?.kind === "werewolfSawWerewolves" && update.private.werewolfIds.length === 0;
    if (soloWolf) {
      setActiveAction({ role: "werewolf-solo" });
    }
  }, [update?.game.night, nightPromptOpen, activeAction, update?.private?.kind, update?.private, update?.you.playerId, update?.you.originalRole]);

  useEffect(() => {
    if (update?.game.phase !== "voting") {
      setSelectedVoteId(null);
    }
  }, [update?.game.phase]);

  useEffect(() => {
    const handleResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (update?.you.originalRole) {
      setMyCurrentRole(update.you.originalRole);
    }
    if (update?.game.phase === "lobby" || update?.game.phase === "deal") {
      setMyFaceUp(true);
    } else if (update?.game.phase && update.game.phase !== "night") {
      setMyFaceUp(true);
    }
  }, [update?.you.originalRole, update?.game.phase]);

  useEffect(() => {
    if (!update?.private) return;
    const kind = update.private.kind;
    const id = Date.now();
    const nameFor = (idVal: string) => update.game.players.find((p) => p.playerId === idVal)?.name ?? "Player";
    switch (kind) {
      case "minionSawWerewolves": {
        const names = update.private.werewolfIds.map(nameFor);
        setToast({ message: names.length ? `Werewolves: ${names.join(", ")}` : "No other werewolves", id });
        break;
      }
      case "masonSawMasons": {
        const names = update.private.masonIds.map(nameFor);
        setToast({ message: names.length ? `Masons: ${names.join(", ")}` : "No other masons", id });
        break;
      }
      case "werewolfSoloPeek": {
        setToast({
          message: `Center ${update.private.centerIndex + 1}: ${update.private.role}`,
          id,
        });
        setMyFaceUp(true);
        break;
      }
      case "seerViewPlayer": {
        setToast({
          message: `You saw ${nameFor(update.private.targetPlayerId)}: ${update.private.role}`,
          id,
        });
        break;
      }
      case "seerViewCenter": {
        const parts = update.private.center.map((c) => `Center ${c.centerIndex + 1}: ${c.role}`);
        setToast({ message: parts.join(" | "), id });
        break;
      }
      case "robberNewRole": {
        setToast({ message: `You are now ${update.private.role}`, id });
        setMyCurrentRole(update.private.role);
        setMyFaceUp(true);
        break;
      }
      case "insomniacFinalRole": {
        setToast({ message: `Your final role: ${update.private.role}`, id });
        break;
      }
      default:
        break;
    }
    if (kind !== "none") {
      const timer = setTimeout(() => setToast((current) => (current?.id === id ? null : current)), 4500);
      return () => clearTimeout(timer);
    }
  }, [update?.private?.kind]);

  useEffect(() => {
    if (update?.game.roleSelection && update.you.isHost) {
      const nextCounts: Record<Role, number> = { ...recommendedCounts };
      allowedRoles.forEach((role) => {
        nextCounts[role] = update.game.roleSelection.filter((r) => r === role).length;
      });
      setRoleCounts(nextCounts);
      setView("game");
    } else if (update) {
      setView("game");
    }
  }, [update?.game.roleSelection, update?.you.isHost]);

  useEffect(() => {
    if (update?.game.phase !== "deal") {
      setDealAckedLocal(false);
    } else if (update.game.dealAcks?.[update.you.playerId]) {
      setDealAckedLocal(true);
    }
  }, [update?.game.phase, update?.game.dealAcks, update?.you.playerId]);

  const lobbyPlayer = update?.you;

  const armActionForRole = (role: Role, opts?: { soloWerewolf?: boolean }) => {
    switch (role) {
      case "seer":
        setActiveAction({ role: "seer", centerPicks: [] });
        break;
      case "robber":
        setActiveAction({ role: "robber" });
        break;
      case "troublemaker":
        setActiveAction({ role: "troublemaker", picks: [] });
        break;
      case "insomniac":
        setActiveAction({ role: "insomniac" });
        break;
      case "werewolf":
        if (opts?.soloWerewolf) {
          setActiveAction({ role: "werewolf-solo" });
        } else {
          setActiveAction(null);
        }
        break;
      default:
        setActiveAction(null);
    }
    setNightPromptOpen(false);
  };

  const createRoom = () => {
    console.log("[ui] create room", { gameName, socketId: socket.id, connected: socket.connected });
    socket.emit(
      "room:create",
      { gameName, maxPlayers: 10, name: name.trim() || "Host" },
      (resp?: { playerId: string; resumeSecret: string; roomCode: string }) => {
        if (resp?.playerId && resp?.resumeSecret && resp?.roomCode) {
          persistSession(resp);
          sessionRef.current = resp;
        }
      }
    );
    setView("configure");
  };

  const joinRoom = () => {
    console.log("[ui] join room", { roomCode, name });
    socket.emit(
      "room:join",
      {
        roomCode: roomCode.trim().toUpperCase(),
        name: name.trim() || "Player",
      },
      (resp?: { playerId: string; resumeSecret: string; roomCode: string }) => {
        if (resp?.playerId && resp?.resumeSecret && resp?.roomCode) {
          persistSession(resp);
          sessionRef.current = resp;
        }
      }
    );
    setView("game");
  };

  const toggleReady = () => {
    if (!update) return;
    console.log("[ui] toggle ready");
    socket.emit("lobby:setReady", {
      roomCode: update.roomCode,
      playerId: update.you.playerId,
      ready: !update.you.ready,
    });
  };

  const startGame = () => {
    if (!update || !update.you.isHost) return;
    console.log("[ui] host:startGame");
    if (countsToArray(roleCounts).length !== requiredRoles) {
      setError(`Select exactly ${requiredRoles} roles before starting.`);
      return;
    }
    socket.emit("host:startGame", { roomCode: update.roomCode, hostPlayerId: update.you.playerId });
  };

  const endGame = () => {
    if (!update) return;
    if (update.you.isHost) {
      socket.emit("host:resetGame", { roomCode: update.roomCode, hostPlayerId: update.you.playerId });
    }
    socket.emit("room:leave", { roomCode: update.roomCode, playerId: update.you.playerId });
    clearSession();
    sessionRef.current = null;
    setUpdate(null);
    setView("home");
  };

  const leaveGame = () => {
    if (!update) return;
    socket.emit("room:leave", { roomCode: update.roomCode, playerId: update.you.playerId });
    clearSession();
    sessionRef.current = null;
    setUpdate(null);
    setView("home");
  };

  const startNight = () => {
    if (!update || !update.you.isHost) return;
    console.log("[ui] host:startNight");
    socket.emit("host:startNight", { roomCode: update.roomCode, hostPlayerId: update.you.playerId });
  };

  const advanceNight = () => {
    if (!update || !update.you.isHost) return;
    console.log("[ui] host:advanceNightStep");
    socket.emit("host:advanceNightStep", {
      roomCode: update.roomCode,
      hostPlayerId: update.you.playerId,
    });
  };

  const startVoting = () => {
    if (!update || !update.you.isHost) return;
    console.log("[ui] host:startVoting");
    socket.emit("host:startVoting", { roomCode: update.roomCode, hostPlayerId: update.you.playerId });
  };

  const hostProgress = () => {
    if (!update || !update.you.isHost) return;
    switch (update.game.phase) {
      case "lobby":
        startGame();
        break;
      case "deal":
        startNight();
        break;
      case "night":
        advanceNight();
        break;
      case "discussion":
        startVoting();
        break;
      case "voting":
        reveal();
        break;
      case "reveal":
        resetGame();
        break;
      default:
        break;
    }
  };

  const hostButtonLabel = () => {
    if (!update) return "Start / Resume";
    switch (update.game.phase) {
      case "lobby":
        return "Start game";
      case "deal":
        return "Start night";
      case "night":
        return "Next step";
      case "discussion":
        return "Start voting";
      case "voting":
        return "Reveal";
      case "reveal":
        return "Reset";
      default:
        return "Start / Resume";
    }
  };

  const lockVotes = (locked: boolean) => {
    if (!update || !update.you.isHost) return;
    console.log("[ui] host:lockVotes", { locked });
    socket.emit("host:lockVotes", {
      roomCode: update.roomCode,
      hostPlayerId: update.you.playerId,
      locked,
    });
  };

  const reveal = () => {
    if (!update || !update.you.isHost) return;
    console.log("[ui] host:reveal");
    socket.emit("host:reveal", { roomCode: update.roomCode, hostPlayerId: update.you.playerId });
  };

  const resetGame = () => {
    if (!update || !update.you.isHost) return;
    console.log("[ui] host:resetGame");
    socket.emit("host:resetGame", { roomCode: update.roomCode, hostPlayerId: update.you.playerId });
  };

  const voteFor = (targetPlayerId: string) => {
    if (!update) return;
    console.log("[ui] vote:submit", targetPlayerId);
    socket.emit("vote:submit", {
      roomCode: update.roomCode,
      playerId: update.you.playerId,
      targetPlayerId,
    });
  };

  const renderLanding = () => (
    <div className="page hero-shell">
      <header className="hero">
        <p className="eyebrow">One-Night Social Deduction</p>
        <h1>Werewolf Control Room</h1>
        <p className="lede">
          Pick a lane: host creates and configures the deck, or join with a room code. Built for fast
          mobile play.
        </p>
        <div className="choice-grid">
          <div className="glass choice-card">
            <h2>Create a game</h2>
            <div className="field">
              <label>Game name</label>
              <input value={gameName} onChange={(e) => setGameName(e.target.value)} />
            </div>
            <div className="field">
              <label>Your name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Riley" />
            </div>
            <button className="button primary" type="button" onClick={createRoom}>
              Create & configure
            </button>
          </div>
          <div className="glass choice-card">
            <h2>Join a game</h2>
            <div className="field">
              <label>Your name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Riley" />
            </div>
            <div className="field">
              <label>Room code</label>
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
              />
            </div>
            <button className="button ghost" type="button" onClick={joinRoom}>
              Join room
            </button>
          </div>
        </div>
        <div className="pill-row">
          <span className="pill">Socket: {connectionStatus}</span>
          <span className="pill">ID: {socketId ?? "n/a"}</span>
          {sessionRef.current ? (
            <button
              className="button ghost small"
              type="button"
              onClick={() => socket.emit("session:resume", sessionRef.current)}
            >
              Resume saved
            </button>
          ) : null}
          {sessionRef.current ? (
            <button
              className="button tiny"
              type="button"
              onClick={() => {
                sessionRef.current = null;
                clearSession();
              }}
            >
              Clear saved
            </button>
          ) : null}
        </div>
        {error ? <p className="error">⚠️ {error}</p> : null}
      </header>
    </div>
  );

  const renderPlayerCards = () => (
    <div className="player-grid">
      {update?.game.players.map((player) => {
        const isYou = update.you.playerId === player.playerId;
        const isHost = player.playerId === update.game.hostPlayerId;
        const initial = player.name.slice(0, 1).toUpperCase();
        return (
          <div key={player.playerId} className={`player-card ${isYou ? "you" : ""}`}>
            <div className="avatar" aria-hidden>
              {initial}
            </div>
            <div className="player-info">
              <div className="player-line">
                <span className="player-name">{player.name}</span>
                {isHost ? <span className="chip">Host</span> : null}
                {isYou ? <span className="chip accent">You</span> : null}
              </div>
              <div className="player-status">
                <span className={player.connected ? "dot on" : "dot"} />
                <span>{player.connected ? "Online" : "Away"}</span>
                <span className="pill small">{player.ready ? "Ready" : "Not ready"}</span>
                {update.game.phase === "voting" && player.hasVoted ? (
                  <span className="pill small">Voted</span>
                ) : null}
              </div>
            </div>
            {update.game.phase === "voting" && update.you.playerId !== player.playerId ? (
              <button className="button ghost small" type="button" onClick={() => voteFor(player.playerId)}>
                Vote
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  const renderNightPanel = () => {
    if (!update?.game.night) return null;
    const role = update.game.night.stepRole;
    const isYourStep =
      update.you.originalRole === role ||
      (role === "werewolf" && update.you.originalRole === "werewolf") ||
      (role === "mason" && update.you.originalRole === "mason") ||
      (role === "minion" && update.you.originalRole === "minion");
    const script: Record<Role, string> = {
      werewolf:
        "Werewolves, wake up and look for other werewolves. If alone, you may view one center card. Werewolves, close your eyes.",
      minion: "Minion, wake up. Werewolves, put your thumbs up so the minion can see you. Minion, close your eyes.",
      mason: "Masons, wake up and look for other masons. Masons, close your eyes.",
      seer: "Seer, wake up. View a player's card or two center cards. Seer, close your eyes.",
      robber: "Robber, wake up. Swap your card with another player's and view your new card. Robber, close your eyes.",
      troublemaker: "Troublemaker, wake up. Swap two other players' cards. Troublemaker, close your eyes.",
      insomniac: "Insomniac, wake up and look at your card. Insomniac, close your eyes.",
      villager: "",
    };
    const renderActions = () => {
    switch (role) {
      case "seer":
        return (
          <div className="stack">
            <p className="lede">Tap a player card to view it, or tap two center cards to peek them.</p>
              {isYourStep ? (
                <button className="button primary" type="button" onClick={() => armActionForRole("seer")}>
                  Start action
                </button>
              ) : null}
            </div>
          );
        case "robber":
          return (
            <div className="stack">
              <p className="lede">Tap a player card to swap with them and see your new role.</p>
              {isYourStep ? (
                <button className="button primary" type="button" onClick={() => armActionForRole("robber")}>
                  Start action
                </button>
              ) : null}
            </div>
          );
        case "troublemaker":
          return (
            <div className="stack">
              <p className="lede">Tap two different player cards in order to swap their roles.</p>
              {isYourStep ? (
                <button className="button primary" type="button" onClick={() => armActionForRole("troublemaker")}>
                  Start action
                </button>
              ) : null}
            </div>
          );
        case "mason":
          return (
            <div className="stack">
              <p className="lede">Look for the other mason. Tap acknowledge once you have seen them.</p>
              {isYourStep ? (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => {
                    socket.emit("night:action:done", { roomCode: update.roomCode, playerId: update.you.playerId });
                    setNightPromptOpen(false);
                  }}
                >
                  Acknowledge
                </button>
              ) : null}
            </div>
          );
        case "minion":
          return (
            <div className="stack">
              <p className="lede">
                Watch for pulsing werewolves. Their names will show once revealed. Tap start to continue.
              </p>
              {isYourStep ? (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => {
                    setNightPromptOpen(false);
                    socket.emit("night:action:done", {
                      roomCode: update.roomCode,
                      playerId: update.you.playerId,
                    });
                  }}
                >
                  Start
                </button>
              ) : null}
            </div>
          );
        case "werewolf":
          const wolfList =
            update.private?.kind === "werewolfSawWerewolves"
              ? update.private.werewolfIds
              : [];
          const solo = wolfList.length === 0;
          return (
            <div className="stack">
              {solo ? (
                <p className="lede">You are the only werewolf. You may peek one center card.</p>
              ) : (
                <div className="pill-row">
                  <span className="pill">Other werewolves:</span>
                  {wolfList.map((id) => {
                    const wolf = update.game.players.find((p) => p.playerId === id);
                    return (
                      <span key={id} className="pill accent">
                        {wolf?.name ?? "Werewolf"}
                      </span>
                    );
                  })}
                </div>
              )}
              {isYourStep ? (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => {
                    if (solo) {
                      armActionForRole("werewolf", { soloWerewolf: true });
                      // Lone wolf will mark completion when they peek a center card.
                    } else {
                      setNightPromptOpen(false);
                      socket.emit("night:action:done", {
                        roomCode: update.roomCode,
                        playerId: update.you.playerId,
                      });
                    }
                  }}
                >
                  {solo ? "Start action" : "Got it"}
                </button>
              ) : null}
            </div>
          );
        case "insomniac":
          return (
            <div className="stack">
              <p className="lede">Tap your own card to peek your final role.</p>
              {isYourStep ? (
                <button className="button primary" type="button" onClick={() => armActionForRole("insomniac")}>
                  Start action
                </button>
              ) : null}
            </div>
          );
        default:
          return (
            <button
              className="button"
              type="button"
              onClick={() =>
                socket.emit("night:action:done", {
                  roomCode: update.roomCode,
                  playerId: update.you.playerId,
                })
              }
            >
              Done
            </button>
          );
      }
    };

    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Night Action</h3>
          <div className="pill-row">
            <span className="pill">{role}</span>
            <span className="pill">
              Step {update.game.night.stepIndex + 1} / {update.game.night.totalSteps}
            </span>
            {nightCountdown > 0 ? <span className="pill">Countdown: {nightCountdown}</span> : null}
          </div>
        </div>
        <div className="panel-body">
          <p className="lede">{script[role]}</p>
          {!isYourStep ? <div className="overlay-callout">Keep eyes closed</div> : renderActions()}
        </div>
      </div>
    );
  };

  const renderActionOverlay = () => {
    switch (update.game.phase) {
      case "lobby":
        return (
          <div className="overlay">
            <div className="overlay-card">
              <h3>Lobby</h3>
              {update.you.isHost ? (
                <div className="stack">
                  <p className="lede">Pick the deck and start when everyone is ready.</p>
                  <div className="pill-row">
                    <span className="pill info-pill" onClick={copyRoom}>
                      Room {update.roomCode}
                      <button className="icon-button" type="button" aria-label="Copy room code">
                        📋
                      </button>
                      {copyStatus === "copied" ? <span className="pill small success">Copied</span> : null}
                      {copyStatus === "error" ? <span className="pill small error-pill">Failed</span> : null}
                    </span>
                  </div>
                  <div className="role-grid">
                    {allowedRoles.map((role) => {
                      const count = roleCounts[role];
                      const cap = ROLE_CAPS[role];
                      const capReached = count >= cap;
                      return (
                        <div key={role} className="role-chip">
                          <span className="pill small">{role}</span>
                          <div className="role-buttons">
                            <button
                              className="button tiny"
                              type="button"
                              onClick={() => {
                                if (count <= 0) return;
                                setRoleCounts((prev) => ({ ...prev, [role]: Math.max(0, prev[role] - 1) }));
                              }}
                              disabled={count === 0}
                            >
                              -
                            </button>
                            <span>{count}</span>
                            <button
                              className="button tiny"
                              type="button"
                              onClick={() => {
                                if (capReached) return;
                                setRoleCounts((prev) => ({ ...prev, [role]: Math.min(cap, prev[role] + 1) }));
                              }}
                              disabled={capReached}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="pill-row">
                    <span className="pill">Players: {update.game.players.length}</span>
                    <span className="pill">Ready: {update.game.players.filter((p) => p.ready).length}</span>
                    <span className="pill">
                      Roles: {countsToArray(roleCounts).length}/{requiredRoles}
                    </span>
                  </div>
              <div className="panel-body players-inline">{renderPlayerCards()}</div>
              <div className="cta-row wrap">
                <button
                  className="button primary"
                  type="button"
                      onClick={() => {
                        socket.emit("host:updateRoles", {
                          roomCode: update.roomCode,
                          hostPlayerId: update.you.playerId,
                          roles: countsToArray(roleCounts).slice(0, requiredRoles),
                        });
                        startGame();
                      }}
                  disabled={!canStart || update.game.players.length < 3}
                >
                  Start game
                </button>
                <button className="button ghost small" type="button" onClick={endGame}>
                  End game
                </button>
              </div>
            </div>
          ) : (
            <div className="stack">
              <p className="lede">Waiting for host to pick roles and start. Ready up when you&rsquo;re set.</p>
                  <div className="pill-row">
                    <span className="pill info-pill" onClick={copyRoom}>
                      Room {update.roomCode}
                      <button className="icon-button" type="button" aria-label="Copy room code">
                        📋
                      </button>
                      {copyStatus === "copied" ? <span className="pill small success">Copied</span> : null}
                      {copyStatus === "error" ? <span className="pill small error-pill">Failed</span> : null}
                    </span>
                  </div>
              <button className="button" type="button" onClick={toggleReady}>
                {lobbyPlayer?.ready ? "Unready" : "Ready"}
              </button>
              <button className="button ghost small" type="button" onClick={leaveGame}>
                Leave lobby
              </button>
                  <div className="pill-row">
                    <span className="pill">Players: {update.game.players.length}</span>
                    <span className="pill">Ready: {update.game.players.filter((p) => p.ready).length}</span>
                  </div>
                  <div className="panel-body players-inline">{renderPlayerCards()}</div>
                </div>
              )}
            </div>
          </div>
        );
      case "deal":
        if (dealAckedLocal) return null;
        return (
          <div className="overlay">
            <div className="overlay-card role-card">
              <div className="role-grid-modal">
                <div className="role-text">
                  <p className="eyebrow">Your role</p>
                  <h2>Keep it secret</h2>
                  <p className="lede">Tap acknowledge once you&rsquo;ve seen it.</p>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() =>
                      socket.emit("player:ackRole", { roomCode: update.roomCode, playerId: update.you.playerId }, () =>
                        setDealAckedLocal(true)
                      )
                    }
                  >
                    Acknowledge
                  </button>
                </div>
                <div className="hero-card framed">
                  {roleImage(update.you.originalRole) ? (
                    <img src={roleImage(update.you.originalRole)} alt={update.you.originalRole ?? "role"} />
                  ) : (
                    <div className="card-face up" style={faceStyle(update.you.originalRole, "up")} />
                  )}
                  <div className="card-role under-card">{update.you.originalRole ?? "??"}</div>
                </div>
              </div>
            </div>
          </div>
        );
      case "night":
        if (nightPromptOpen) {
          return (
            <div className="overlay">
              <div className="overlay-card">
                {renderNightPanel()}
                <div className="row wrap host-inline-cta">
                  {update.you.isHost ? (
                    <button className="button primary small" type="button" onClick={advanceNight}>
                      Next step
                    </button>
                  ) : null}
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => {
                      const role = update.game.night?.stepRole;
                      const isYourStep =
                        role === update.you.originalRole ||
                        (role === "werewolf" && update.you.originalRole === "werewolf") ||
                        (role === "mason" && update.you.originalRole === "mason") ||
                        (role === "minion" && update.you.originalRole === "minion");
                      if (isYourStep && role) {
                        armActionForRole(role, { soloWerewolf: role === "werewolf" && isSoloWerewolf });
                      } else {
                        setNightPromptOpen(false);
                      }
                    }}
                  >
                    {update.game.night?.stepRole === update.you.originalRole ? "Start" : "Continue"}
                  </button>
                </div>
              </div>
            </div>
          );
        }
        return null;
      case "reveal":
        return (
          <div className="overlay">
            <div className="overlay-card">
              <h3>Reveal</h3>
              {renderRevealPanel()}
              {update.you.isHost ? (
                <div className="row wrap host-inline-cta">
                  <button className="button primary" type="button" onClick={resetGame}>
                    Play again
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderTokensPanel = () => {
    if (!update || (update.game.phase !== "discussion" && update.game.phase !== "voting")) return null;
    const markSuspect = (targetId: string, role: Role) => {
      socket.emit("discussion:token:add", {
        roomCode: update.roomCode,
        playerId: update.you.playerId,
        targetPlayerId: targetId,
        role,
      });
    };
    const clearSuspect = (targetId: string) => {
      socket.emit("discussion:token:remove", {
        roomCode: update.roomCode,
        playerId: update.you.playerId,
        targetPlayerId: targetId,
      });
    };
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Suspicion</h3>
          <span className="pill">Tap a player to assign a role</span>
        </div>
        <div className="panel-body token-grid">
          {update.game.players
            .filter((p) => p.playerId !== update.you.playerId)
            .map((player) => {
              const suspectRole =
                update.game.tokens?.suspectRolesByPlayer?.[update.you.playerId]?.[player.playerId] ?? "";
              return (
                <div key={player.playerId} className="token-row">
                  <div className="player-name">{player.name}</div>
                  <div className="token-controls">
                    <select value={suspectRole} onChange={(e) => markSuspect(player.playerId, e.target.value as Role)}>
                      <option value="">Pick role</option>
                      {allowedRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    {suspectRole ? (
                      <button className="button ghost small" type="button" onClick={() => clearSuspect(player.playerId)}>
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          <button
            className="button ghost small"
            type="button"
            onClick={() =>
              socket.emit("discussion:token:clearAll", {
                roomCode: update.roomCode,
                playerId: update.you.playerId,
              })
            }
          >
            Clear all my suspicions
          </button>
        </div>
      </div>
    );
  };

  const renderRevealPanel = () => {
    if (!update || update.game.phase !== "reveal" || !update.game.reveal) return null;
    const nameFor = (id?: string) => {
      if (!id) return "none (tie/no kill)";
      return update.game.players.find((p) => p.playerId === id)?.name ?? id;
    };
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Reveal</h3>
        </div>
        <div className="panel-body stack">
          <div>
            <strong>Winners:</strong> {update.game.reveal.winners}
          </div>
          <div>
            <strong>Eliminated:</strong> {nameFor(update.game.reveal.eliminatedPlayerId)}
          </div>
        </div>
      </div>
    );
  };

  const renderHostControls = () => {
    if (!update?.you.isHost) return null;
    const allReady = update.game.players.every((p) => p.ready);
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Host Controls</h3>
        </div>
        <div className="panel-body cta-row wrap">
          <button className="button" type="button" onClick={startGame} disabled={!allReady || !canStart}>
            Start game
          </button>
          <button className="button" type="button" onClick={startNight}>
            Start night
          </button>
          <button className="button" type="button" onClick={advanceNight}>
            Advance night
          </button>
          <button className="button" type="button" onClick={startVoting}>
            Start voting
          </button>
          <button className="button" type="button" onClick={() => lockVotes(!update.game.voting?.locked)}>
            {update.game.voting?.locked ? "Unlock votes" : "Lock votes"}
          </button>
          <button className="button" type="button" onClick={reveal}>
            Reveal
          </button>
          <button className="button ghost" type="button" onClick={resetGame}>
            Reset
          </button>
          <button className="button ghost" type="button" onClick={endGame}>
            End game for all
          </button>
        </div>
      </div>
    );
  };

  const renderDealPanel = () => {
    if (!update || update.game.phase !== "deal") return null;
    const hasAcked = update.game.dealAcks?.[update.you.playerId];
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Deal</h3>
        </div>
        <div className="panel-body cta-row wrap">
          <button
            className="button"
            type="button"
            onClick={() =>
              socket.emit("player:ackRole", { roomCode: update.roomCode, playerId: update.you.playerId })
            }
          >
            {hasAcked ? "Role acknowledged" : "Acknowledge role"}
          </button>
        </div>
      </div>
    );
  };

  if (!update) {
    return view === "configure" ? renderLanding() : renderLanding();
  }

  const requiredRoles = update.game.players.length + 3;
  const selectionCount = countsToArray(roleCounts).length;
  const canStart = selectionCount === requiredRoles;

  const renderTable = () => {
    const cancelAction = () => {
      setActiveAction(null);
    };
    const totalTokensOnTarget = (targetId: string) => {
      if (!update.game.tokens) return 0;
      return Object.values(update.game.tokens.tokensByPlayer ?? {}).reduce(
        (sum, record) => sum + (record[targetId] ?? 0),
        0
      );
    };
    const highlightIds = new Set<string>();
    const highlightLabels = new Map<string, string>();
    if (update.private?.kind === "minionSawWerewolves") {
      update.private.werewolfIds.forEach((id) => {
        highlightIds.add(id);
        highlightLabels.set(id, "Werewolf");
      });
    }
    if (update.private?.kind === "werewolfSawWerewolves") {
      update.private.werewolfIds.forEach((id) => {
        highlightIds.add(id);
        highlightLabels.set(id, "Werewolf");
      });
    }
    if (update.private?.kind === "masonSawMasons") {
      update.private.masonIds.forEach((id) => {
        highlightIds.add(id);
        highlightLabels.set(id, "Mason");
      });
    }
    const revealedCenter = new Map<number, Role>();
    if (update.private?.kind === "seerViewCenter") {
      update.private.center.forEach((c) => revealedCenter.set(c.centerIndex, c.role));
    }
    if (update.private?.kind === "werewolfSoloPeek") {
      revealedCenter.set(update.private.centerIndex, update.private.role);
    }
    const revealedPlayer =
      update.private?.kind === "seerViewPlayer"
        ? { id: update.private.targetPlayerId, role: update.private.role }
        : null;

    const handleSeatClick = (playerId: string) => {
      if (update.game.phase === "night") {
        if (!activeAction) return;
        switch (activeAction.role) {
          case "seer": {
            socket.emit("night:seer:viewPlayer", {
              roomCode: update.roomCode,
              playerId: update.you.playerId,
              targetPlayerId: playerId,
            });
            setActiveAction(null);
            break;
          }
          case "robber": {
            if (playerId === update.you.playerId) return;
            socket.emit("night:robber:swap", {
              roomCode: update.roomCode,
              playerId: update.you.playerId,
              targetPlayerId: playerId,
            });
            setActiveAction(null);
            break;
          }
          case "troublemaker": {
            if (activeAction.picks.includes(playerId)) return;
            const picks = [...activeAction.picks, playerId];
            if (picks.length < 2) {
              setActiveAction({ role: "troublemaker", picks });
            } else {
              socket.emit("night:troublemaker:swap", {
                roomCode: update.roomCode,
                playerId: update.you.playerId,
                targetPlayerIds: picks as [string, string],
              });
              setActiveAction(null);
            }
            break;
          }
          case "insomniac": {
            if (playerId !== update.you.playerId) return;
            socket.emit("night:insomniac:peekFinal", {
              roomCode: update.roomCode,
              playerId: update.you.playerId,
            });
            setActiveAction(null);
            break;
          }
          default:
            break;
        }
        return;
      }
      if (update.game.phase === "voting") {
        if (playerId === update.you.playerId) return;
        setSelectedVoteId(playerId);
        voteFor(playerId);
        return;
      }
      if (update.game.phase === "discussion") {
        if (playerId === update.you.playerId) return;
        setSuspectTargetId(playerId);
      }
    };

    const handleCenterClick = (index: number) => {
      if (!activeAction || update.game.phase !== "night") return;
      switch (activeAction.role) {
        case "seer": {
          if (activeAction.centerPicks.includes(index)) return;
          const picks = [...activeAction.centerPicks, index];
          if (picks.length < 2) {
            setActiveAction({ role: "seer", centerPicks: picks });
          } else {
            socket.emit("night:seer:viewCenter", {
              roomCode: update.roomCode,
              playerId: update.you.playerId,
              centerIndices: picks as [0 | 1 | 2, 0 | 1 | 2],
            });
            setActiveAction(null);
          }
          break;
        }
        case "werewolf-solo": {
          socket.emit("night:werewolf:soloPeek", {
            roomCode: update.roomCode,
            playerId: update.you.playerId,
            centerIndex: index as 0 | 1 | 2,
          });
          setActiveAction(null);
          break;
        }
        default:
          break;
      }
    };

    const actionHint = () => {
      if (!activeAction) return null;
      switch (activeAction.role) {
        case "seer":
          return activeAction.centerPicks.length
            ? `Select ${2 - activeAction.centerPicks.length} more center card(s)`
            : "Tap a player card or pick two center cards";
        case "robber":
          return "Tap a player to swap with";
        case "troublemaker":
          return activeAction.picks.length === 0 ? "Tap first player to swap" : "Tap second player";
        case "werewolf-solo":
          return "Tap one center card to peek";
        case "insomniac":
          return "Tap your card to peek final role";
        default:
          return null;
      }
    };
    const suspicionFor = (targetId: string) => {
      const roles =
        update.game.tokens?.suspectRolesByPlayer &&
        Object.values(update.game.tokens.suspectRolesByPlayer).map((m) => m[targetId]).filter(Boolean);
      const counts: Record<string, number> = {};
      roles?.forEach((role) => {
        counts[role] = (counts[role] ?? 0) + 1;
      });
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    };

    const handleDropOn = (targetId: string) => (e: DragEvent) => {
      e.preventDefault();
      if (targetId === update.you.playerId) return;
      socket.emit("discussion:token:add", {
        roomCode: update.roomCode,
        playerId: update.you.playerId,
        targetPlayerId: targetId,
      });
    };

    const handleClearDrop = (e: DragEvent) => {
      e.preventDefault();
      socket.emit("discussion:token:clearAll", {
        roomCode: update.roomCode,
        playerId: update.you.playerId,
      });
    };

    const renderCenterCards = (mode: "grid" | "cluster") => (
      <div className={`center-cards ${mode === "grid" ? "row" : "triangle"}`}>
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            className={`card-slot center ${
              activeAction?.role === "seer" || activeAction?.role === "werewolf-solo" ? "actionable" : ""
            } ${mode === "triangle" ? `c${idx}` : ""}`}
            onClick={() => handleCenterClick(idx)}
          >
            <div
              className={`card-face ${revealedCenter.has(idx) ? "up" : "down"}`}
              style={faceStyle(revealedCenter.get(idx), revealedCenter.has(idx) ? "up" : "down")}
            />
          </div>
        ))}
      </div>
    );

    const renderSeat = (
      player: Player,
      index: number,
      layoutKind: "grid" | "band",
      pos: { left?: string; top?: string } = {}
    ) => {
      const isYou = update.you.playerId === player.playerId;
      const suspectRole = update.game.tokens?.suspectRolesByPlayer?.[update.you.playerId]?.[player.playerId];
      const totalTokens = totalTokensOnTarget(player.playerId);
      const suspects = suspicionFor(player.playerId);
      let isActionTarget = false;
      if (activeAction) {
        switch (activeAction.role) {
          case "robber":
            isActionTarget = player.playerId !== update.you.playerId;
            break;
          case "troublemaker":
            isActionTarget = true;
            break;
          case "seer":
            isActionTarget = true;
            break;
          case "insomniac":
            isActionTarget = player.playerId === update.you.playerId;
            break;
          default:
            isActionTarget = false;
        }
      }
      const voteTally = update.game.voting?.tally?.[player.playerId] ?? 0;
      const youVotedHere = selectedVoteId === player.playerId;

      return (
        <div
          key={player.playerId}
          className={`seat ${isYou ? "you" : ""} ${highlightIds.has(player.playerId) ? "highlight" : ""} ${
            isActionTarget ? "actionable" : ""
          } ${layoutKind === "grid" || layoutKind === "band" ? "seat--grid" : ""}`}
          style={pos}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropOn(player.playerId)}
          onClick={() => handleSeatClick(player.playerId)}
        >
          <div className="card-slot">
            <div
              className={`card-face ${isYou && myFaceUp ? "up" : "down"} ${
                revealedPlayer?.id === player.playerId ? "up" : ""
              }`}
              style={
                isYou
                  ? faceStyle(myCurrentRole ?? update.you.originalRole, myFaceUp ? "up" : "down")
                  : revealedPlayer?.id === player.playerId
                  ? faceStyle(revealedPlayer.role, "up")
                  : faceStyle(undefined, "down")
              }
            >
              {suspectRole ? <div className="card-role">{suspectRole}</div> : null}
            </div>
          </div>
          <div className="card-footer">
            <div className="pill tiny">{isYou ? `${player.name} (You)` : player.name}</div>
            {highlightLabels.get(player.playerId) ? (
              <div className="highlight-tag">{highlightLabels.get(player.playerId)}</div>
            ) : null}
          </div>
          {totalTokens > 0 ? <div className="token-bubble">{totalTokens}</div> : null}
          {update.game.phase === "voting" ? (
            <div className="vote-badge">
              <span>{voteTally}</span>
              {youVotedHere ? <span className="pill tiny">Your vote</span> : null}
            </div>
          ) : null}
          {suspects.length ? (
            <div className="suspect-chips">
              {suspects.map(([role, count]) => (
                <span key={role} className="pill tiny">
                  {role} {count > 1 ? `x${count}` : ""}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    };

    const players = update.game.players;
    const playerCount = players.length;
    const isCompact = viewport.w < 900 || viewport.h < 700;
    let body: JSX.Element | null = null;

    if (isCompact) {
      const cols = playerCount > 6 ? 3 : 2;
      body = (
        <div className="table table-grid">
          <div className="table-center">
            <div className="center-row">{renderCenterCards("grid")}</div>
          </div>
          <div className={`seats-grid cols-${cols}`}>
            {players.map((player, idx) => renderSeat(player, idx, "grid", {}))}
          </div>
        </div>
      );
    } else {
      // Replaced absolute/polar seat positioning with a responsive surround grid
      const quads = { top: [] as Player[], right: [] as Player[], bottom: [] as Player[], left: [] as Player[] };
      players.forEach((p, idx) => {
        switch (idx % 4) {
          case 0:
            quads.top.push(p);
            break;
          case 1:
            quads.right.push(p);
            break;
          case 2:
            quads.bottom.push(p);
            break;
          default:
            quads.left.push(p);
            break;
        }
      });
      body = (
        <div className="table table-surround">
          <div className="surround top-band">{quads.top.map((p, idx) => renderSeat(p, idx, "band", {}))}</div>
          <div className="surround middle-band">
            <div className="side left-band">{quads.left.map((p, idx) => renderSeat(p, idx, "band", {}))}</div>
            <div className="table-center">
              <div className="center-row">{renderCenterCards("cluster")}</div>
            </div>
            <div className="side right-band">{quads.right.map((p, idx) => renderSeat(p, idx, "band", {}))}</div>
          </div>
          <div className="surround bottom-band">{quads.bottom.map((p, idx) => renderSeat(p, idx, "band", {}))}</div>
        </div>
      );
    }

    return (
      <>
        {body}
        {activeAction ? (
          <div className="action-toast">
            <span>{actionHint()}</span>
            <button className="button tiny ghost" type="button" onClick={cancelAction}>
              Cancel
            </button>
          </div>
        ) : null}
        {suspectTargetId ? (
          <div className="action-toast">
            <span>
              Suspect {update.game.players.find((p) => p.playerId === suspectTargetId)?.name ?? "player"} as:
            </span>
            <select
              onChange={(e) => {
                const role = e.target.value as Role;
                if (!role) return;
                socket.emit("discussion:token:add", {
                  roomCode: update.roomCode,
                  playerId: update.you.playerId,
                  targetPlayerId: suspectTargetId,
                  role,
                });
                setSuspectTargetId(null);
              }}
            >
              <option value="">Pick role</option>
              {allowedRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button className="button tiny ghost" type="button" onClick={() => setSuspectTargetId(null)}>
              Cancel
            </button>
          </div>
        ) : null}
        {toast ? <div className="action-toast secondary">{toast.message}</div> : null}
      </>
    );
  };

  const copyRoom = async () => {
    try {
      await navigator.clipboard.writeText(update.roomCode);
      console.log("Copied room code");
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 1200);
    } catch (err) {
      console.error("Copy failed", err);
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 1200);
    }
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="game-shell">
      <main className="board">
        <section className="panel table-panel">
          <div className="panel-body">{renderTable()}</div>
        </section>
      </main>
      <div className="table-info">
        <div className="info-spacer" />
        <div className="phase-chip">
          <span className="phase-label">Phase</span>
          <span className="phase-value">{update.game.phase}</span>
        </div>
        <div className="info-right">
          {update.you.isHost ? <div className="pill accent info-pill">Host</div> : null}
          <button className="icon-button settings-icon" type="button" onClick={() => setShowSettings(true)} aria-label="Settings">
            ⚙️
          </button>
        </div>
      </div>
      {renderActionOverlay()}
      {update.you.isHost ? (
        <div className="host-bar">
          <button
            className="button primary small"
            type="button"
            onClick={hostProgress}
            disabled={update.game.phase === "lobby" && (!canStart || update.game.players.length < 3)}
          >
            {hostButtonLabel()}
          </button>
          <button className="button ghost small" type="button" onClick={endGame}>
            End game
          </button>
        </div>
      ) : null}
      {showSettings ? (
        <div className="overlay" onClick={() => setShowSettings(false)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <h3>Settings</h3>
              <button className="icon-button" type="button" onClick={() => setShowSettings(false)}>
                ✕
              </button>
            </div>
            <div className="panel-body stack">
              <div className="pill-row">
                <span className="pill">Room {update.roomCode}</span>
                <span className="pill">Phase: {update.game.phase}</span>
              </div>
              <div className="pill-row">
                <span className="pill">Players: {update.game.players.length}</span>
                <span className="pill">Ready: {update.game.players.filter((p) => p.ready).length}</span>
              </div>
              {update.game.phase === "lobby" && update.you.isHost ? (
                <div className="stack">
                  <div className="role-grid">
                    {allowedRoles.map((role) => {
                      const count = roleCounts[role];
                      const cap = ROLE_CAPS[role];
                      const capReached = count >= cap;
                      return (
                        <div key={role} className="role-chip">
                          <span className="pill small">{role}</span>
                          <div className="role-buttons">
                            <button
                              className="button tiny"
                              type="button"
                              onClick={() => {
                                if (count <= 0) return;
                                setRoleCounts((prev) => ({ ...prev, [role]: Math.max(0, prev[role] - 1) }));
                              }}
                              disabled={count === 0}
                            >
                              -
                            </button>
                            <span>{count}</span>
                            <button
                              className="button tiny"
                              type="button"
                              onClick={() => {
                                if (capReached) return;
                                setRoleCounts((prev) => ({ ...prev, [role]: Math.min(cap, prev[role] + 1) }));
                              }}
                              disabled={capReached}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => {
                      socket.emit("host:updateRoles", {
                        roomCode: update.roomCode,
                        hostPlayerId: update.you.playerId,
                        roles: countsToArray(roleCounts).slice(0, requiredRoles),
                      });
                      startGame();
                      setShowSettings(false);
                    }}
                    disabled={!canStart || update.game.players.length < 3}
                  >
                    Start game ({countsToArray(roleCounts).length}/{requiredRoles})
                  </button>
                  <div className="panel-body players-inline">{renderPlayerCards()}</div>
                </div>
              ) : null}
              {update.game.phase !== "lobby" ? <div className="panel-body players-inline">{renderPlayerCards()}</div> : null}
              <button className="button ghost" type="button" onClick={leaveGame}>
                Leave game
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
