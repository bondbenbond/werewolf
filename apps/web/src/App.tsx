import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { io, Socket } from "socket.io-client";
import { Phase, PrivateView, Role } from "@werewolf/shared";
import "./index.css";

declare global {
  interface Window {
    __ENV__?: {
      SERVER_URL?: string;
    };
  }
}

type PublicPlayer = {
  playerId: string;
  name: string;
  connected: boolean;
  ready: boolean;
  hasVoted?: boolean;
};

type RoomPublicState = {
  phase: Phase;
  phaseEndsAt?: number;
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
    autoAdvanceNight: boolean;
    parallelNight: boolean;
  };
  dealAcks?: Record<string, boolean>;
  night?: {
    stepRole: Role | null;
    completedThisStep: Record<string, boolean>;
    stepIndex: number;
    totalSteps: number;
    endsAt?: number;
    mode?: "sequential" | "parallel";
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
    eliminatedPlayerIds?: string[];
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

const socketUrl =
  (typeof window !== "undefined" && window.__ENV__?.SERVER_URL) ||
  import.meta.env.VITE_SERVER_URL ||
  (typeof window !== "undefined" && window.location.origin) ||
  "http://localhost:4000";
const createSocket = () =>
  io(socketUrl, {
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
  const roleOrder: Partial<Record<Role, number>> = {
    werewolf: 1,
    minion: 2,
    mason: 3,
    seer: 4,
    robber: 5,
    troublemaker: 6,
    insomniac: 7,
  };
  const toTitleCase = (value: string) =>
    value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split("-")
      .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
      .join(" ");
  const displayRole = (role?: Role) => (role ? toTitleCase(role) : role);
  const roleLabel = (role: Role) =>
    roleOrder[role] ? `${roleOrder[role]} ${toTitleCase(role)}` : toTitleCase(role);
  const multiTokenRoles = new Set<Role>(["villager", "werewolf", "mason"]);
  const formatCountdown = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remaining = safeSeconds % 60;
    return `${minutes}:${String(remaining).padStart(2, "0")}`;
  };
  const handleEnter = (event: React.KeyboardEvent<HTMLInputElement>, action: () => void) => {
    if (event.key === "Enter") {
      action();
    }
  };
  const renderRoleCard = (role: Role) => (
    <div className="result-card">
      {roleImage(role) ? (
        <img src={roleImage(role)} alt={role} />
      ) : (
        <div className="card-face up" style={faceStyle(role, "up")} />
      )}
      <div className="card-role under-card">{displayRole(role)}</div>
    </div>
  );

  // Night action selections
  // Night selections now driven by table taps; no manual inputs needed here.
  const [nightCountdown, setNightCountdown] = useState(0);
  const [phaseCountdown, setPhaseCountdown] = useState(0);
  const [view, setView] = useState<"home" | "configure" | "game">("home");
  const sessionRef = useRef<{ roomCode: string; playerId: string; resumeSecret: string } | null>(null);
  const urlRoomRef = useRef<string | null>(null);
  const joinPromptedRef = useRef(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [pendingJoinRoom, setPendingJoinRoom] = useState<string | null>(null);
  const [pendingJoinName, setPendingJoinName] = useState("");
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
  const suspectSelectRefs = useRef<Record<string, HTMLSelectElement | null>>({});
  const roleSelectionKeyRef = useRef<string | null>(null);
  const [parallelAwaitingResult, setParallelAwaitingResult] = useState(false);
  const nightStepKeyRef = useRef<string | null>(null);
  const troublemakerPicksRef = useRef<string[]>([]);
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const [showRevealOverlay, setShowRevealOverlay] = useState(true);
  const cardBackSrc = "/assets/cards/card-back.jpeg";
const roleImage = (role?: Role) => (role ? `/assets/cards/${role}.jpeg` : undefined);
const roleFocus: Record<Role, { x: string; y: string }> = {
  villager: { x: "50%", y: "45%" },
  werewolf: { x: "48%", y: "40%" },
  minion: { x: "52%", y: "42%" },
  mason: { x: "50%", y: "45%" },
  seer: { x: "50%", y: "45%" },
  robber: { x: "48%", y: "40%" },
  troublemaker: { x: "50%", y: "42%" },
  insomniac: { x: "50%", y: "46%" },
};
  const [myCurrentRole, setMyCurrentRole] = useState<Role | undefined>(undefined);
  const [myFaceUp, setMyFaceUp] = useState(true);
  const [viewport, setViewport] = useState({ w: typeof window !== "undefined" ? window.innerWidth : 1200, h: typeof window !== "undefined" ? window.innerHeight : 800 });
  const sanitizeRoom = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  const clearRoomParam = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url.toString());
  };
  const resetJoinFlow = () => {
    setPendingJoinRoom(null);
    urlRoomRef.current = null;
    joinPromptedRef.current = false;
    setJoinModalOpen(false);
  };
  const [autoAdvanceNight, setAutoAdvanceNight] = useState(true);

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
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      const code = sanitizeRoom(roomParam);
      if (code.length >= 4) {
        urlRoomRef.current = code;
        setRoomCode(code);
        setPendingJoinRoom(code);
        setPendingJoinName((name || "").trim());
        if (!sessionRef.current) {
          setView("configure");
        }
      }
    }
  }, []);

  useEffect(() => {
    if (joinPromptedRef.current) return;
    if (!pendingJoinRoom) return;
    if (sessionRef.current) return;
    if (connectionStatus === "connecting") return;
    joinPromptedRef.current = true;
    setJoinModalOpen(true);
  }, [connectionStatus, pendingJoinRoom, name]);

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
      clearRoomParam();
      resetJoinFlow();
      alert("The host ended the game. Returning to the main menu.");
      setView("home");
    });
    socket.on("room:kicked", () => {
      clearSession();
      sessionRef.current = null;
      setUpdate(null);
      clearRoomParam();
      resetJoinFlow();
      alert("You were removed from the lobby by the host.");
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
    const endsAt = update.game.night.endsAt ?? Date.now() + 10_000;
    const updateCountdown = () => {
      const remainingMs = endsAt - Date.now();
      setNightCountdown(Math.max(0, Math.ceil(remainingMs / 1000)));
    };
    updateCountdown();
    const id = setInterval(updateCountdown, 500);
    return () => clearInterval(id);
  }, [update?.game.night?.stepRole, update?.game.night?.stepIndex, update?.game.night?.endsAt]);

  useEffect(() => {
    const timedPhase =
      update?.game.phase === "discussion" ||
      update?.game.phase === "voting" ||
      update?.game.phase === "parallelResult" ||
      update?.game.phase === "nightCountdown";
    if (!timedPhase) {
      setPhaseCountdown(0);
      return;
    }
    const endsAt = update?.game.phaseEndsAt;
    if (!endsAt) {
      setPhaseCountdown(0);
      return;
    }
    const updateCountdown = () => {
      const remainingMs = endsAt - Date.now();
      setPhaseCountdown(Math.max(0, Math.ceil(remainingMs / 1000)));
    };
    updateCountdown();
    const id = setInterval(updateCountdown, 500);
    return () => clearInterval(id);
  }, [update?.game.phase, update?.game.phaseEndsAt]);

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
    const key = `${update.game.night.mode ?? "sequential"}-${update.game.night.stepRole}-${update.game.night.stepIndex}`;
    if (nightStepKeyRef.current !== key) {
      nightStepKeyRef.current = key;
      setNightPromptOpen(true);
      setActiveAction(null);
      troublemakerPicksRef.current = [];
      setSuspectTargetId(null);
      setMyFaceUp(false);
    }
  }, [update?.game.night?.stepIndex, update?.game.night?.stepRole, update?.game.night]);

  useEffect(() => {
    if (!update?.game.night) return;
    const isParallelNight = update.game.night.mode === "parallel";
    const role = isParallelNight ? update.you.originalRole : update.game.night.stepRole;
    if (!role) return;
    const isYourStep = isParallelNight
      ? true
      : update.you.originalRole === role ||
        (role === "werewolf" && update.you.originalRole === "werewolf") ||
        (role === "mason" && update.you.originalRole === "mason") ||
        (role === "minion" && update.you.originalRole === "minion");
    if (!isYourStep) return;
    if (!update.game.night.completedThisStep?.[update.you.playerId]) return;
    setActiveAction(null);
    setNightPromptOpen(false);
  }, [
    update?.game.night?.completedThisStep,
    update?.game.night?.mode,
    update?.game.night?.stepRole,
    update?.you.originalRole,
    update?.you.playerId,
  ]);

  useEffect(() => {
    // Auto-arm solo werewolf center peek when prompt is dismissed.
    if (!update?.game.night || nightPromptOpen || activeAction) return;
    if (update.you.originalRole !== "werewolf") return;
    const completed = update.game.night.completedThisStep?.[update.you.playerId];
    if (completed) return;
    if (update.game.night.mode === "parallel") {
      if (update.private?.kind !== "werewolfSoloStatus" || !update.private.isSolo) return;
      setActiveAction({ role: "werewolf-solo" });
      return;
    }
    if (update.game.night.stepRole !== "werewolf") return;
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
    if (update?.game.phase !== "night") {
      troublemakerPicksRef.current = [];
    }
  }, [update?.game.phase]);

  useEffect(() => {
    const isParallelNight = update?.game.night?.mode === "parallel";
    const completed = !!update?.game.night?.completedThisStep?.[update?.you.playerId ?? ""];
    if (update?.game.phase !== "night" || !isParallelNight) {
      setParallelAwaitingResult(false);
      return;
    }
    setParallelAwaitingResult(completed);
  }, [update?.game.phase, update?.game.night?.mode, update?.game.night?.completedThisStep, update?.you.playerId]);

  useEffect(() => {
    const handleResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
      document.documentElement.style.setProperty("--vw", `${window.innerWidth * 0.01}px`);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      visualViewport?.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (update?.you.originalRole) {
      setMyCurrentRole(update.you.originalRole);
    }
    const phase = update?.game.phase;
    if (!phase) return;
    if (phase === "lobby") {
      setMyFaceUp(false);
      return;
    }
    if (phase === "deal") {
      const acked = !!update.game.dealAcks?.[update.you.playerId];
      setMyFaceUp(acked);
      return;
    }
    if (phase === "night") {
      setMyFaceUp(false);
      return;
    }
    if (phase === "discussion" || phase === "voting" || phase === "parallelResult") {
      setMyFaceUp(false);
      return;
    }
    // reveal or other host-only states
    setMyFaceUp(true);
  }, [update?.you.originalRole, update?.game.phase, update?.game.dealAcks, update?.you.playerId]);

  useEffect(() => {
    if (activeAction?.role !== "troublemaker") {
      troublemakerPicksRef.current = [];
    }
  }, [activeAction?.role]);

  useEffect(() => {
    if (update?.game.phase === "reveal") {
      setShowRevealOverlay(true);
    } else {
      setShowRevealOverlay(false);
    }
  }, [update?.game.phase]);

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
          message: `Center ${update.private.centerIndex + 1}: ${displayRole(update.private.role)}`,
          id,
        });
        break;
      }
      case "seerViewPlayer": {
        setToast({
          message: `You saw ${nameFor(update.private.targetPlayerId)}: ${displayRole(update.private.role)}`,
          id,
        });
        break;
      }
      case "seerViewCenter": {
        const parts = update.private.center.map(
          (c) => `Center ${c.centerIndex + 1}: ${displayRole(c.role)}`
        );
        setToast({ message: parts.join(" | "), id });
        break;
      }
      case "robberNewRole": {
        setToast({ message: `You are now ${displayRole(update.private.role)}`, id });
        setMyCurrentRole(update.private.role);
        if (update?.game.phase !== "parallelResult") {
          setMyFaceUp(true);
        }
        break;
      }
      case "insomniacFinalRole": {
        setToast({ message: `Your final role: ${displayRole(update.private.role)}`, id });
        setMyCurrentRole(update.private.role);
        if (update?.game.phase !== "parallelResult") {
          setMyFaceUp(true);
        }
        break;
      }
      default:
        break;
    }
    if (kind !== "none") {
      const timer = setTimeout(() => setToast((current) => (current?.id === id ? null : current)), 4500);
      return () => clearTimeout(timer);
    }
  }, [update?.private?.kind, update?.game.phase]);

  useEffect(() => {
    if (!update) return;
    const roleSelection = update.game.roleSelection ?? [];
    if (update.you.isHost) {
      if (roleSelection.length === 0) {
        if (roleSelectionKeyRef.current !== "empty") {
          const zeroedCounts = allowedRoles.reduce(
            (acc, role) => ({ ...acc, [role]: 0 }),
            {} as Record<Role, number>
          );
          roleSelectionKeyRef.current = "empty";
          setRoleCounts(zeroedCounts);
        }
        setView("game");
        return;
      }
      const nextKey = roleSelection.join("|");
      if (roleSelectionKeyRef.current === nextKey) {
        setView("game");
        return;
      }
      roleSelectionKeyRef.current = nextKey;
      const nextCounts: Record<Role, number> = { ...recommendedCounts };
      allowedRoles.forEach((role) => {
        nextCounts[role] = roleSelection.filter((r) => r === role).length;
      });
      setRoleCounts((current) => {
        const unchanged = allowedRoles.every((role) => current[role] === nextCounts[role]);
        return unchanged ? current : nextCounts;
      });
      setView("game");
      return;
    }
    roleSelectionKeyRef.current = roleSelection.join("|");
    setView("game");
  }, [update?.game.roleSelection, update?.you.isHost]);

  useEffect(() => {
    if (update?.game.settings?.autoAdvanceNight === undefined) return;
    setAutoAdvanceNight(update.game.settings.autoAdvanceNight);
  }, [update?.game.settings?.autoAdvanceNight]);

  // Host: auto-advance night steps if enabled.
  useEffect(() => {
    if (!update?.you.isHost) return;
    if (!autoAdvanceNight) return;
    if (!update.game.night) return;
    if (update.game.night.mode === "parallel") return;
    const key = `${update.game.night.stepRole}-${update.game.night.stepIndex}`;
    const advancedKey = `${key}-auto-advanced`;
    if (nightStepKeyRef.current !== key && nightStepKeyRef.current !== advancedKey) {
      nightStepKeyRef.current = key;
    }
    if (nightStepKeyRef.current === advancedKey) return;
    if (nightPromptOpen) {
      setNightPromptOpen(false);
      return;
    }
    if (nightCountdown > 0) return;
    nightStepKeyRef.current = advancedKey;
    advanceNight();
  }, [
    autoAdvanceNight,
    update?.game.night?.stepIndex,
    update?.game.night?.stepRole,
    nightPromptOpen,
    nightCountdown,
  ]);

  useEffect(() => {
    if (update?.game.phase !== "deal") {
      setDealAckedLocal(false);
    } else if (update.game.dealAcks?.[update.you.playerId]) {
      setDealAckedLocal(true);
    }
  }, [update?.game.phase, update?.game.dealAcks, update?.you.playerId]);

  const lobbyPlayer = update?.you;

  const warnAlreadyDone = () => {
    const id = Date.now();
    setToast({ message: "You have already performed your action.", id });
    setTimeout(() => setToast((current) => (current?.id === id ? null : current)), 2200);
  };

  const armActionForRole = (role: Role, opts?: { soloWerewolf?: boolean }) => {
    if (update?.game.night?.completedThisStep?.[update.you.playerId]) {
      warnAlreadyDone();
      return;
    }
    switch (role) {
      case "seer":
        setActiveAction({ role: "seer", centerPicks: [] });
        break;
      case "robber":
        setActiveAction({ role: "robber" });
        break;
      case "troublemaker":
        troublemakerPicksRef.current = [];
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

  const joinRoom = (opts?: { room?: string; playerName?: string }) => {
    const targetRoom = sanitizeRoom(opts?.room ?? roomCode);
    if (targetRoom.length < 4) {
      setError("Room code must be 4-6 characters");
      return;
    }
    setError(null);
    const targetName = opts?.playerName?.trim() || name.trim() || "Player";
    console.log("[ui] join room", { roomCode: targetRoom, name: targetName });
    setRoomCode(targetRoom);
    setName(targetName);
    setJoinModalOpen(false);
    setPendingJoinRoom(null);
    socket.emit(
      "room:join",
      {
        roomCode: targetRoom,
        name: targetName,
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
    clearRoomParam();
    resetJoinFlow();
    setView("home");
  };

  const leaveGame = () => {
    if (!update) return;
    socket.emit("room:leave", { roomCode: update.roomCode, playerId: update.you.playerId });
    clearSession();
    sessionRef.current = null;
    setUpdate(null);
    clearRoomParam();
    resetJoinFlow();
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
    if (update.game.phase === "night" && update.game.night?.mode === "parallel" && autoAdvanceNight) {
      return;
    }
    switch (update.game.phase) {
      case "lobby":
        startGame();
        break;
      case "deal":
        startNight();
        break;
      case "nightCountdown":
        break;
      case "night":
        advanceNight();
        break;
      case "parallelResult":
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
      case "nightCountdown":
        return "Night starts";
      case "night":
        return "Next step";
      case "parallelResult":
        return "To discussion";
      case "discussion":
        return "Start voting";
      case "voting":
        return "Reveal";
      case "reveal":
        return "Play again";
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

  const kickPlayer = (targetPlayerId: string) => {
    if (!update || !update.you.isHost) return;
    socket.emit("host:kickPlayer", {
      roomCode: update.roomCode,
      hostPlayerId: update.you.playerId,
      targetPlayerId,
    });
  };

  const renderLanding = () => (
    <div className="page hero-shell">
      <header className="hero">
        <p className="eyebrow">One-Night Social Deduction</p>
        <h1>One Night Ultimate Werewolf</h1>
        <p className="lede">Host a table for friends or jump in with a room code.</p>
        <div className="choice-grid">
          <div className="glass choice-card create-card">
            <h2>Create a game</h2>
            <div className="field">
              <label>Your name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Riley"
                onKeyDown={(e) => handleEnter(e, createRoom)}
              />
            </div>
            <button className="button primary" type="button" onClick={createRoom}>
              Create & configure
            </button>
          </div>
          <div className="glass choice-card join-card">
            <h2>Join a game</h2>
            <div className="field">
              <label>Your name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Riley"
                onKeyDown={(e) => handleEnter(e, joinRoom)}
              />
            </div>
            <div className="field">
              <label>Room code</label>
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(sanitizeRoom(e.target.value))}
                placeholder="123456"
                onKeyDown={(e) => handleEnter(e, joinRoom)}
              />
            </div>
            <button className="button ghost" type="button" onClick={joinRoom}>
              Join room
            </button>
          </div>
        </div>
        <div className="pill-row">
          <span className="pill">Status: {connectionStatus}</span>
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
                clearRoomParam();
                resetJoinFlow();
                setUpdate(null);
                setRoomCode("");
                setView("home");
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

  const renderInviteJoin = () => {
    const code = pendingJoinRoom ?? urlRoomRef.current ?? roomCode;
    return (
      <div className="page hero-shell">
        <header className="hero">
          <p className="eyebrow">Join game</p>
          <h1>Room {code || "..."}</h1>
          <p className="lede">Enter your name to jump into this room.</p>
          <div className="choice-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="glass choice-card join-card">
              <div className="field">
                <label>Your name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Riley"
                  onKeyDown={(e) => handleEnter(e, () => joinRoom({ room: code, playerName: name || pendingJoinName || "Player" }))}
                />
              </div>
              <button
                className="button primary"
                type="button"
                onClick={() =>
                  joinRoom({
                    room: code,
                    playerName: name || pendingJoinName || "Player",
                  })
                }
                disabled={!code}
              >
                Join room
              </button>
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => {
                      setPendingJoinRoom(null);
                      urlRoomRef.current = null;
                      clearRoomParam();
                      resetJoinFlow();
                      setView("home");
                    }}
                  >
                    Back
                  </button>
              {error ? <p className="error">⚠️ {error}</p> : null}
            </div>
          </div>
        </header>
      </div>
    );
  };

  const renderPlayerCards = (options?: { showKick?: boolean }) => {
    const allowKick = !!update?.you.isHost && update?.game.phase === "lobby";
    const showKick = options?.showKick ?? allowKick;
    return (
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
            {showKick && allowKick && !isYou ? (
              <button className="button ghost small" type="button" onClick={() => kickPlayer(player.playerId)}>
                Kick
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
  };

  const renderNightPanel = () => {
    if (!update?.game.night) return null;
    const isParallelNight = update.game.night.mode === "parallel";
    const role = isParallelNight ? update.you.originalRole ?? "villager" : update.game.night.stepRole;
    if (!role) return null;
    const isYourStep = isParallelNight
      ? true
      : update.you.originalRole === role ||
        (role === "werewolf" && update.you.originalRole === "werewolf") ||
        (role === "mason" && update.you.originalRole === "mason") ||
        (role === "minion" && update.you.originalRole === "minion");
    const parallelSuffix = isParallelNight ? " You'll see the result when the timer ends." : "";
    const script: Record<Role, string> = {
      werewolf: "Werewolves, look for each other. If you are alone, you may check one center card.",
      minion: "Minion, look for the werewolves.",
      mason: "Masons, look for each other.",
      seer: "Seer, you may view one player's card or two center cards.",
      robber: "Robber, you may swap your card with another player's and then view your new role.",
      troublemaker: "Troublemaker, you may swap two other players.",
      insomniac: "Insomniac, you will view your final role.",
      villager: "Villagers, you have no night action.",
    };
    const renderActions = () => {
    switch (role) {
        case "seer":
          return (
            <div className="stack">
              <p className="lede">Press Start, then tap a player or two center cards to view them.</p>
              {isYourStep ? (
                <button className="button primary" type="button" onClick={() => armActionForRole("seer")}>
                  Start
                </button>
              ) : null}
            </div>
          );
        case "robber":
          return (
            <div className="stack">
              <p className="lede">Press Start, then tap a player to swap and view your new role.</p>
              {isYourStep ? (
                <button className="button primary" type="button" onClick={() => armActionForRole("robber")}>
                  Start
                </button>
              ) : null}
            </div>
          );
        case "troublemaker":
          return (
            <div className="stack">
              <p className="lede">Press Start, then tap two players to swap.</p>
              {isYourStep ? (
                <button className="button primary" type="button" onClick={() => armActionForRole("troublemaker")}>
                  Start
                </button>
              ) : null}
            </div>
          );
        case "mason":
          return (
            <div className="stack">
              <p className="lede">Press Start to see any other mason.</p>
              {isYourStep ? (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => {
                    socket.emit("night:action:done", { roomCode: update.roomCode, playerId: update.you.playerId });
                    setNightPromptOpen(false);
                  }}
                >
                  Start
                </button>
              ) : null}
            </div>
          );
        case "minion":
          return (
            <div className="stack">
              <p className="lede">Press Start to reveal the werewolves.</p>
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
          const solo = isParallelNight
            ? update.private?.kind === "werewolfSoloStatus" && update.private.isSolo
            : update.private?.kind === "werewolfSawWerewolves" && update.private.werewolfIds.length === 0;
          return (
            <div className="stack">
              {solo ? (
                <p className="lede">You are alone. Press Start, then tap one center card to view it.</p>
              ) : (
                <p className="lede">Press Start to see the other werewolves.</p>
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
                  Start
                </button>
              ) : null}
            </div>
          );
        case "insomniac":
          const insomniacRole = update.private?.kind === "insomniacFinalRole" ? update.private.role : undefined;
          return (
            <div className="stack">
              <p className="lede">Press Start to view your final role.</p>
              {insomniacRole ? (
                <div className="hero-card framed">
                  {roleImage(insomniacRole) ? (
                    <img src={roleImage(insomniacRole)} alt={insomniacRole} />
                  ) : (
                    <div className="card-face up" style={faceStyle(insomniacRole, "up")} />
                  )}
                  <div className="card-role under-card">{displayRole(insomniacRole)}</div>
                </div>
              ) : null}
              {isYourStep ? (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => {
                    setNightPromptOpen(false);
                    socket.emit("night:insomniac:peekFinal", {
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
            <span className="pill">{displayRole(role)}</span>
            <span className="pill">
              Step {update.game.night.stepIndex + 1} / {update.game.night.totalSteps}
            </span>
            {nightCountdown > 0 ? <span className="pill">Countdown: {nightCountdown}</span> : null}
          </div>
        </div>
        <div className="panel-body">
          <p className="lede">{script[role]}{parallelSuffix}</p>
          {!isYourStep ? <div className="overlay-callout">Wait for your turn.</div> : renderActions()}
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
                  {renderShareInvite()}
                  <div className="role-grid">
                    {allowedRoles.map((role) => {
                      const count = roleCounts[role];
                      const cap = ROLE_CAPS[role];
                      const step = pairedRoles.has(role) ? 2 : 1;
                      const nextCount = Math.min(cap, count + step);
                      const delta = nextCount - count;
                      const maxedOverall = countsToArray(roleCounts).length + delta > requiredRoles;
                      const capReached = delta <= 0;
                      return (
                        <div key={role} className="role-chip">
                          <span className="pill small">{displayRole(role)}</span>
                          <div className="role-buttons">
                            <button
                              className="button tiny"
                              type="button"
                              onClick={() => {
                                if (count === 0) return;
                                tryAdjustRoleCount(role, "dec");
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
                                if (capReached || maxedOverall) return;
                                tryAdjustRoleCount(role, "inc");
                              }}
                              disabled={capReached || maxedOverall}
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
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={autoAdvanceNight}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setAutoAdvanceNight(next);
                        socket.emit("host:updateSettings", {
                          roomCode: update.roomCode,
                          hostPlayerId: update.you.playerId,
                          settings: { autoAdvanceNight: next },
                        });
                      }}
                    />
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                    <span className="toggle-label">
                      Auto-advance night steps
                      <span
                        className="help-icon"
                        data-tooltip="Automatically move to the next night step when the countdown ends."
                      >
                        ?
                      </span>
                    </span>
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={update.game.settings.parallelNight}
                      onChange={(e) =>
                        socket.emit("host:updateSettings", {
                          roomCode: update.roomCode,
                          hostPlayerId: update.you.playerId,
                          settings: { parallelNight: e.target.checked },
                        })
                      }
                    />
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                    <span className="toggle-label">
                      Parallel night
                      <span
                        className="help-icon"
                        data-tooltip="Everyone performs their night action at once; results are revealed after 10 seconds."
                      >
                        ?
                      </span>
                    </span>
                  </label>
                  <div className="panel-body players-inline">{renderPlayerCards({ showKick: true })}</div>
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
                  {renderShareInvite()}
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
                  <h2>{displayRole(update.you.originalRole) ?? "??"}</h2>
                  <p className="lede">Keep it secret. Tap acknowledge once you&rsquo;ve seen it.</p>
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
                </div>
              </div>
            </div>
          </div>
        );
      case "night":
        if (nightPromptOpen) {
          const isParallelNight = update.game.night?.mode === "parallel";
          const role = isParallelNight ? update.you.originalRole : update.game.night?.stepRole;
          const isYourStep = isParallelNight
            ? true
            : role === update.you.originalRole ||
              (role === "werewolf" && update.you.originalRole === "werewolf") ||
              (role === "mason" && update.you.originalRole === "mason") ||
              (role === "minion" && update.you.originalRole === "minion");
          const isSoloWerewolf = isParallelNight
            ? update.private?.kind === "werewolfSoloStatus" && update.private.isSolo
            : role === "werewolf" &&
              update.private?.kind === "werewolfSawWerewolves" &&
              update.private.werewolfIds.length === 0;
          return (
            <div className="overlay">
              <div className="overlay-card">
                {renderNightPanel()}
                <div className="row wrap host-inline-cta">
                  {update.you.isHost && !isParallelNight ? (
                    <button
                      className="button primary small"
                      type="button"
                      onClick={advanceNight}
                      disabled={nightCountdown > 0}
                    >
                      Next step
                    </button>
                  ) : null}
                  {!isParallelNight &&
                  isYourStep &&
                  role &&
                  role !== "werewolf" &&
                  role !== "mason" &&
                  role !== "robber" &&
                  role !== "troublemaker" &&
                  role !== "insomniac" &&
                  role !== "minion" &&
                  role !== "seer" ? (
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => armActionForRole(role, { soloWerewolf: role === "werewolf" && isSoloWerewolf })}
                    >
                      Start
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        }
        return null;
      case "reveal":
        if (!showRevealOverlay) return null;
        return (
          <div className="overlay">
            <div className="overlay-card">
              <div className="panel-head">
                <h3>Reveal</h3>
                <button className="icon-button" type="button" onClick={() => setShowRevealOverlay(false)}>
                  ✕
                </button>
              </div>
              {renderRevealPanel()}
              {update.you.isHost ? (
                <div className="row wrap host-inline-cta">
                  <button className="button primary" type="button" onClick={resetGame}>
                    Play again
                  </button>
                </div>
              ) : null}
              <div className="row wrap host-inline-cta">
                <button className="button ghost" type="button" onClick={() => setShowRevealOverlay(false)}>
                  Show results
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderTokensPanel = () => {
    if (!update || (update.game.phase !== "discussion" && update.game.phase !== "voting")) return null;
    const roleOptions =
      update.game.roleSelection?.length > 0
        ? Array.from(new Set(update.game.roleSelection))
        : allowedRoles;
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
          {update.game.players.map((player) => {
              const suspectRole =
                update.game.tokens?.suspectRolesByPlayer?.[update.you.playerId]?.[player.playerId] ?? "";
              return (
                <div key={player.playerId} className="token-row">
                  <div className="player-name">{player.name}</div>
                  <div className="token-controls">
                    <select value={suspectRole} onChange={(e) => markSuspect(player.playerId, e.target.value as Role)}>
                      <option value="">Pick role</option>
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
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
    const nameFor = (id?: string) =>
      (id && update.game.players.find((p) => p.playerId === id)?.name) ?? id ?? "Unknown";
    const eliminatedIds = update.game.reveal.eliminatedPlayerIds ?? [];
    const eliminatedLabel = eliminatedIds.length
      ? eliminatedIds.map(nameFor).join(", ")
      : "None (tie/no kill)";
    const werewolfNames = Object.entries(update.game.reveal.finalRoles ?? {})
      .filter(([, role]) => role === "werewolf")
      .map(([id]) => nameFor(id));
    const werewolfLabel = werewolfNames.length ? werewolfNames.join(", ") : "None";
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Reveal</h3>
        </div>
        <div className="panel-body stack">
          <div>
            <strong>Winners:</strong> {toTitleCase(update.game.reveal.winners)}
          </div>
          <div>
            <strong>Werewolves:</strong> {werewolfLabel}
          </div>
          <div>
            <strong>Eliminated:</strong> {eliminatedLabel}
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
          <button
            className="button"
            type="button"
            onClick={advanceNight}
            disabled={update.game.phase === "night" && nightCountdown > 0}
          >
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
            Play again
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
    if (pendingJoinRoom && !sessionRef.current) {
      return renderInviteJoin();
    }
    return view === "configure" ? renderLanding() : renderLanding();
  }

  const requiredRoles = update.game.players.length + 3;
  const selectionCount = countsToArray(roleCounts).length;
  const canStart = selectionCount === requiredRoles;
  const nightStepRole = update.game.night?.stepRole;
  const isParallelNight = update.game.night?.mode === "parallel";
  const pairedRoles = new Set<Role>(["werewolf", "mason"]);
  const showRoleCountError = (message: string) => {
    setError(message);
    setTimeout(() => setError((current) => (current === message ? null : current)), 2200);
  };
  const tryAdjustRoleCount = (role: Role, direction: "inc" | "dec") => {
    const step = pairedRoles.has(role) ? 2 : 1;
    const current = roleCounts[role] ?? 0;
    const next = direction === "inc"
      ? Math.min(ROLE_CAPS[role], current + step)
      : Math.max(0, current - step);
    const delta = next - current;
    if (delta === 0) return;
    if (delta > 0) {
      const total = countsToArray(roleCounts).length;
      if (total + delta > requiredRoles) {
        const label = displayRole(role);
        showRoleCountError(`Adding ${delta} ${label}${delta > 1 ? "s" : ""} would exceed the total role count.`);
        return;
      }
    }
    setRoleCounts((prev) => ({ ...prev, [role]: next }));
  };
  const isYourNightStep =
    update.game.phase === "night" &&
    (isParallelNight
      ? true
      : !!nightStepRole &&
        (update.you.originalRole === nightStepRole ||
          (nightStepRole === "werewolf" && update.you.originalRole === "werewolf") ||
          (nightStepRole === "mason" && update.you.originalRole === "mason") ||
          (nightStepRole === "minion" && update.you.originalRole === "minion")));
  const showTopCountdown =
    update.game.phase === "discussion" ||
    update.game.phase === "voting" ||
    update.game.phase === "parallelResult" ||
    update.game.phase === "nightCountdown" ||
    (update.game.phase === "night" && (isYourNightStep || isParallelNight));
  const topCountdownValue =
    update.game.phase === "night" ? nightCountdown : phaseCountdown;

  const renderTable = () => {
    const cancelAction = () => {
      setActiveAction(null);
      troublemakerPicksRef.current = [];
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
    const canRevealNightInfo = update.game.phase !== "night" || !nightPromptOpen;
    if (update.private?.kind === "minionSawWerewolves") {
      update.private.werewolfIds.forEach((id) => {
        highlightIds.add(id);
        highlightLabels.set(id, "Werewolf");
      });
    }
    if (canRevealNightInfo && update.private?.kind === "werewolfSawWerewolves") {
      update.private.werewolfIds.forEach((id) => {
        highlightIds.add(id);
        highlightLabels.set(id, "Werewolf");
      });
    }
    if (canRevealNightInfo && update.private?.kind === "masonSawMasons") {
      update.private.masonIds.forEach((id) => {
        highlightIds.add(id);
        highlightLabels.set(id, "Mason");
      });
    }
    const allowPrivateReveal = update.game.phase === "night";
    const revealedCenter = new Map<number, Role>();
    if (allowPrivateReveal && update.private?.kind === "seerViewCenter") {
      update.private.center.forEach((c) => revealedCenter.set(c.centerIndex, c.role));
    }
    if (allowPrivateReveal && update.private?.kind === "werewolfSoloPeek") {
      revealedCenter.set(update.private.centerIndex, update.private.role);
    }
    if (update.game.phase === "reveal" && update.game.reveal?.centerRoles?.length) {
      update.game.reveal.centerRoles.forEach((role, idx) => {
        if (role) revealedCenter.set(idx, role);
      });
    }
    const revealedPlayer =
      allowPrivateReveal && update.private?.kind === "seerViewPlayer"
        ? { id: update.private.targetPlayerId, role: update.private.role }
        : null;

    const handleSeatClick = (playerId: string) => {
      if (update.game.phase === "night") {
        if (update.game.night?.completedThisStep?.[update.you.playerId]) {
          warnAlreadyDone();
          return;
        }
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
            if (troublemakerPicksRef.current.includes(playerId)) return;
            const picks = [...troublemakerPicksRef.current, playerId];
            troublemakerPicksRef.current = picks;
            if (picks.length < 2) {
              setActiveAction({ role: "troublemaker", picks });
              return;
            }
            socket.emit("night:troublemaker:swap", {
              roomCode: update.roomCode,
              playerId: update.you.playerId,
              targetPlayerIds: picks as [string, string],
            });
            troublemakerPicksRef.current = [];
            setActiveAction(null);
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
        openSuspectPicker(playerId);
      }
    };

    const handleCenterClick = (index: number) => {
      const targetId = `center-${index}`;
      if (update.game.phase === "discussion") {
        openSuspectPicker(targetId);
        return;
      }
      if (!activeAction || update.game.phase !== "night") return;
      if (update.game.night?.completedThisStep?.[update.you.playerId]) {
        warnAlreadyDone();
        return;
      }
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
    const singleRoleTargets = (() => {
      const targetMap = new Map<Role, string>();
      const tokenMaps = update.game.tokens?.suspectRolesByPlayer ?? {};
      const roleTargetCounts: Partial<Record<Role, Record<string, number>>> = {};
      Object.values(tokenMaps).forEach((suspects) => {
        Object.entries(suspects).forEach(([targetId, role]) => {
          if (!role || multiTokenRoles.has(role as Role)) return;
          const typedRole = role as Role;
          roleTargetCounts[typedRole] = roleTargetCounts[typedRole] ?? {};
          roleTargetCounts[typedRole][targetId] = (roleTargetCounts[typedRole][targetId] ?? 0) + 1;
        });
      });
      Object.entries(roleTargetCounts).forEach(([role, counts]) => {
        const entries = Object.entries(counts);
        if (!entries.length) return;
        entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        targetMap.set(role as Role, entries[0][0]);
      });
      return targetMap;
    })();

    const suspicionFor = (targetId: string) => {
      const roles =
        update.game.tokens?.suspectRolesByPlayer &&
        Object.values(update.game.tokens.suspectRolesByPlayer).map((m) => m[targetId]).filter(Boolean);
      const counts: Record<string, number> = {};
      roles?.forEach((role) => {
        counts[role] = (counts[role] ?? 0) + 1;
      });
      Object.keys(counts).forEach((role) => {
        const typedRole = role as Role;
        if (!multiTokenRoles.has(typedRole)) {
          if (singleRoleTargets.get(typedRole) !== targetId) {
            delete counts[role];
          } else {
            counts[role] = 1;
          }
        }
      });
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    };

    const handleDropOn = (targetId: string) => (e: DragEvent) => {
      e.preventDefault();
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

    const suspectRoleOptions =
      update.game.roleSelection?.length > 0
        ? Array.from(new Set(update.game.roleSelection))
        : allowedRoles;
    const getSuspectRole = (targetId: string) =>
      update.game.tokens?.suspectRolesByPlayer?.[update.you.playerId]?.[targetId] ?? "";
    const handleSuspectChange = (targetId: string, roleValue: string) => {
      if (!roleValue) {
        socket.emit("discussion:token:remove", {
          roomCode: update.roomCode,
          playerId: update.you.playerId,
          targetPlayerId: targetId,
        });
      } else {
        socket.emit("discussion:token:add", {
          roomCode: update.roomCode,
          playerId: update.you.playerId,
          targetPlayerId: targetId,
          role: roleValue as Role,
        });
      }
      setSuspectTargetId(null);
    };
    const renderSuspectSelect = (targetId: string) => {
      if (update.game.phase !== "discussion") return null;
      if (suspectTargetId !== targetId) return null;
      const currentRole = getSuspectRole(targetId);
      return (
        <div className="suspect-select" onClick={(e) => e.stopPropagation()}>
          <select
            autoFocus
            ref={(el) => {
              suspectSelectRefs.current[targetId] = el;
            }}
            value={currentRole}
            onChange={(e) => handleSuspectChange(targetId, e.target.value)}
            onBlur={() =>
              setSuspectTargetId((current) => (current === targetId ? null : current))
            }
          >
            <option value="">Clear</option>
            {suspectRoleOptions.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </div>
      );
    };

    const openSuspectPicker = (targetId: string) => {
      setSuspectTargetId(targetId);
      requestAnimationFrame(() => {
        const el = suspectSelectRefs.current[targetId];
        if (!el) return;
        if (typeof (el as HTMLSelectElement & { showPicker?: () => void }).showPicker === "function") {
          (el as HTMLSelectElement & { showPicker: () => void }).showPicker();
          return;
        }
        el.focus();
        el.click();
      });
    };

    const renderCenterCards = (mode: "grid" | "cluster") => (
      <div className={`center-cards ${mode === "grid" ? "row" : "triangle"}`}>
        {[0, 1, 2].map((idx) => {
          const targetId = `center-${idx}`;
          const visibleRole =
            revealedCenter.get(idx) ??
            (update.game.phase === "reveal" ? update.game.reveal?.centerRoles?.[idx] : undefined);
          const faceState = visibleRole ? "up" : "down";
          const centerSuspects = suspicionFor(targetId);
          const centerTokens: Role[] = [];
          centerSuspects.forEach(([role, count]) => {
            for (let i = 0; i < count; i += 1) centerTokens.push(role as Role);
          });
          const centerSuspectRole =
            update.game.tokens?.suspectRolesByPlayer?.[update.you.playerId]?.[targetId];
          if (
            centerSuspectRole &&
            (multiTokenRoles.has(centerSuspectRole) || singleRoleTargets.get(centerSuspectRole) === targetId) &&
            !centerTokens.includes(centerSuspectRole)
          ) {
            centerTokens.push(centerSuspectRole);
          }
          return (
            <div
              key={idx}
              className={`card-slot center ${
                activeAction?.role === "seer" || activeAction?.role === "werewolf-solo" ? "actionable" : ""
              } ${mode === "triangle" ? `c${idx}` : ""}`}
              onClick={() => handleCenterClick(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropOn(targetId)}
            >
              <div
                className={`card-face ${faceState} ${centerTokens.length ? "suspect-marked" : ""}`}
                style={faceStyle(visibleRole, faceState as "up" | "down")}
              >
                {visibleRole ? <div className="card-label">{displayRole(visibleRole)}</div> : null}
                {centerTokens.length ? (
                  <div className="suspect-tokens">
                    {centerTokens.map((role, tokenIdx) => {
                      const focus = roleFocus[role] ?? { x: "50%", y: "50%" };
                      return (
                        <div
                          key={`${role}-${tokenIdx}`}
                          className="role-token"
                          style={{
                            backgroundImage: `url(${roleImage(role)})`,
                            backgroundPosition: `${focus.x} ${focus.y}`,
                          }}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>
              {renderSuspectSelect(targetId)}
            </div>
          );
        })}
      </div>
    );

    const renderSeat = (
      player: Player,
      index: number,
      layoutKind: "grid" | "band",
      pos: { left?: string; top?: string } = {}
    ) => {
      const isYou = update.you.playerId === player.playerId;
      const revealedRole = update.game.phase === "reveal" ? update.game.reveal?.finalRoles?.[player.playerId] : undefined;
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
      const eliminatedIds = update.game.reveal?.eliminatedPlayerIds ?? [];
      const isEliminated = update.game.phase === "reveal" && eliminatedIds.includes(player.playerId);

      const faceUpRole =
        revealedRole ??
        (isYou && myFaceUp ? myCurrentRole ?? update.you.originalRole : undefined) ??
        (revealedPlayer?.id === player.playerId ? revealedPlayer.role : undefined);
      const faceClass =
        faceUpRole || revealedPlayer?.id === player.playerId || revealedRole ? "up" : isYou && myFaceUp ? "up" : "down";

      const tokens: Role[] = [];
      suspects.forEach(([role, count]) => {
        for (let i = 0; i < count; i += 1) tokens.push(role as Role);
      });
      if (
        suspectRole &&
        (multiTokenRoles.has(suspectRole) || singleRoleTargets.get(suspectRole) === player.playerId) &&
        !tokens.includes(suspectRole)
      ) {
        tokens.push(suspectRole);
      }
      const hasTokens = tokens.length > 0;

      return (
        <div
          key={player.playerId}
          className={`seat ${isYou ? "you" : ""} ${isEliminated ? "eliminated" : ""} ${
            highlightIds.has(player.playerId) ? "highlight" : ""
          } ${isActionTarget ? "actionable" : ""} ${layoutKind === "grid" || layoutKind === "band" ? "seat--grid" : ""}`}
          style={pos}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropOn(player.playerId)}
          onClick={() => handleSeatClick(player.playerId)}
        >
          <div className="card-slot">
            <div
              className={`card-face ${faceClass} ${hasTokens ? "suspect-marked" : ""}`}
              style={faceStyle(faceUpRole, faceClass === "up" ? "up" : "down")}
            >
          {suspectRole ? <div className="card-role">{displayRole(suspectRole)}</div> : null}
          {faceUpRole ? <div className="card-label">{displayRole(faceUpRole)}</div> : null}
          {tokens.length ? (
            <div className="suspect-tokens">
              {tokens.map((role, idx) => {
                const focus = roleFocus[role] ?? { x: "50%", y: "50%" };
                return (
                  <div
                    key={`${role}-${idx}`}
                    className="role-token"
                    style={{
                      backgroundImage: `url(${roleImage(role)})`,
                      backgroundPosition: `${focus.x} ${focus.y}`,
                    }}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
            {renderSuspectSelect(player.playerId)}
          </div>
      <div className="card-footer">
        <div className="pill tiny">{isYou ? `${player.name} (You)` : player.name}</div>
        {highlightLabels.get(player.playerId) ? (
          <div className="highlight-tag">{highlightLabels.get(player.playerId)}</div>
        ) : null}
        {isEliminated ? <div className="elimination-tag">Eliminated</div> : null}
      </div>
      {update.game.phase === "voting" ? (
        <div className="vote-badge">
          <span>{voteTally}</span>
          {youVotedHere ? <span className="pill tiny">Your vote</span> : null}
        </div>
      ) : null}
    </div>
  );
};

    const players = update.game.players;
    const compactGrid = viewport.w < 700 || viewport.h < 600;

    const playerCount = players.length;
    const manyPlayers = playerCount >= 9;
    const midPlayers = !manyPlayers && playerCount >= 6;
    const body = (
      <div className="table table-grid">
        <div className="table-center">
          <div className="center-row">{renderCenterCards("grid")}</div>
        </div>
        <div
          className={`seats-grid seats-auto ${compactGrid ? "compact" : ""} ${
            manyPlayers ? "many" : midPlayers ? "mid" : ""
          }`}
        >
          {players.map((player, idx) => renderSeat(player, idx, "grid", {}))}
        </div>
      </div>
    );

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
        {update.game.phase === "parallelResult" && update.private?.kind ? (
          <div className="result-panel">
            <div className="result-card-shell">
              {(() => {
                const nameFor = (id: string) =>
                  update.game.players.find((p) => p.playerId === id)?.name ?? "Player";
                switch (update.private.kind) {
                  case "minionSawWerewolves": {
                    const names = update.private.werewolfIds.map(nameFor);
                    return (
                      <>
                        <div className="result-title">Werewolves</div>
                        <div className="result-subtitle">
                          {names.length ? names.join(", ") : "No werewolves"}
                        </div>
                      </>
                    );
                  }
                  case "masonSawMasons": {
                    const names = update.private.masonIds.map(nameFor);
                    return (
                      <>
                        <div className="result-title">Masons</div>
                        <div className="result-subtitle">
                          {names.length ? names.join(", ") : "No other masons"}
                        </div>
                      </>
                    );
                  }
                  case "werewolfSawWerewolves": {
                    const names = update.private.werewolfIds.map(nameFor);
                    return (
                      <>
                        <div className="result-title">Werewolves</div>
                        <div className="result-subtitle">
                          {names.length ? names.join(", ") : "No other werewolves"}
                        </div>
                      </>
                    );
                  }
                  case "werewolfSoloStatus": {
                    return (
                      <>
                        <div className="result-title">You are alone</div>
                        <div className="result-subtitle">No card viewed.</div>
                      </>
                    );
                  }
                  case "seerViewPlayer": {
                    const targetName =
                      update.game.players.find((p) => p.playerId === update.private.targetPlayerId)?.name ?? "Player";
                    return (
                      <>
                        <div className="result-title">You saw {targetName}</div>
                        <div className="result-cards">{renderRoleCard(update.private.role)}</div>
                      </>
                    );
                  }
                  case "seerViewCenter": {
                    return (
                      <>
                        <div className="result-title">You saw the center</div>
                        <div className="result-cards">
                          {update.private.center.map((c) => (
                            <div key={c.centerIndex}>{renderRoleCard(c.role)}</div>
                          ))}
                        </div>
                      </>
                    );
                  }
                  case "werewolfSoloPeek": {
                    return (
                      <>
                        <div className="result-title">Center {update.private.centerIndex + 1}</div>
                        <div className="result-cards">{renderRoleCard(update.private.role)}</div>
                      </>
                    );
                  }
                  case "robberNewRole": {
                    return (
                      <>
                        <div className="result-title">You are now</div>
                        <div className="result-cards">{renderRoleCard(update.private.role)}</div>
                      </>
                    );
                  }
                  case "insomniacFinalRole": {
                    return (
                      <>
                        <div className="result-title">Your final role</div>
                        <div className="result-cards">{renderRoleCard(update.private.role)}</div>
                      </>
                    );
                  }
                  default:
                    return (
                      <>
                        <div className="result-title">No night action</div>
                        <div className="result-subtitle">You did not receive any new information.</div>
                      </>
                    );
                }
              })()}
              <div className="result-subtitle">Discussion starts in {formatCountdown(phaseCountdown)}.</div>
            </div>
          </div>
        ) : null}
        {parallelAwaitingResult && update.game.night?.mode === "parallel" ? (
          <div className={`mini-modal ${update.you.isHost ? "host" : ""}`}>
            <div className="mini-modal-card">
              <div className="mini-modal-text">
                You will see the result of your action in {formatCountdown(nightCountdown)}.
              </div>
            </div>
          </div>
        ) : null}
        {update.game.phase === "nightCountdown" ? (
          <div className={`mini-modal ${update.you.isHost ? "host" : ""}`}>
            <div className="mini-modal-card">
              <div className="mini-modal-text">
                Night starts in {formatCountdown(phaseCountdown)}.
              </div>
            </div>
          </div>
        ) : null}
        {update.game.phase === "deal" && dealAckedLocal && !update.you.isHost ? (
          <div className="mini-modal">
            <div className="mini-modal-card">
              <div className="mini-modal-text">Waiting on host to start the night...</div>
            </div>
          </div>
        ) : null}
        {toast ? <div className="action-toast secondary">{toast.message}</div> : null}
      </>
    );
  };

  const copyRoom = async () => {
    if (!update) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${update.roomCode}`;
    const sharePayload = {
      title: "Werewolf game invite",
      text: `Join my Werewolf game`,
      url: shareUrl,
    };
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
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
      setTimeout(() => setCopyStatus("idle"), 1200);
    } catch (err) {
      console.error("Share/copy failed", err);
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 1200);
    }
  };

  const getShareUrl = () =>
    update ? `${window.location.origin}${window.location.pathname}?room=${update.roomCode}` : "";

  const renderShareInvite = () => {
    if (!update) return null;
    const shareUrl = getShareUrl();
    return (
      <div className="pill-row">
        <div className="pill info-pill share-pill">
          <span>Room</span>
          <a className="share-link" href={shareUrl} target="_blank" rel="noreferrer">
            {update.roomCode}
          </a>
          <button className="button ghost small" type="button" onClick={copyRoom}>
            Copy link
          </button>
          {copyStatus === "copied" ? <span className="pill small success">Copied</span> : null}
          {copyStatus === "error" ? <span className="pill small error-pill">Copy failed</span> : null}
        </div>
      </div>
    );
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="game-shell">
      <main className="board">
        <section className="panel table-panel">
          <div className="panel-body table-body">{renderTable()}</div>
        </section>
      </main>
      {joinModalOpen ? (
        <div className="overlay">
          <div className="overlay-card">
            <h3>Join game</h3>
            <p className="lede">
              Enter your name to join room {pendingJoinRoom ?? urlRoomRef.current ?? ""}
            </p>
            <div className="field">
              <label>Your name</label>
              <input
                value={pendingJoinName}
                onChange={(e) => setPendingJoinName(e.target.value)}
                placeholder="Your name"
                onKeyDown={(e) =>
                  handleEnter(e, () =>
                    joinRoom({
                      room: pendingJoinRoom ?? urlRoomRef.current ?? "",
                      playerName: pendingJoinName || name || "Player",
                    })
                  )
                }
              />
            </div>
            <div className="row wrap">
              <button
                className="button primary"
                type="button"
                onClick={() =>
                  joinRoom({
                    room: pendingJoinRoom ?? urlRoomRef.current ?? "",
                    playerName: pendingJoinName || name || "Player",
                  })
                }
                disabled={!(pendingJoinRoom ?? urlRoomRef.current)}
              >
                Join game
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => {
                  setJoinModalOpen(false);
                  joinPromptedRef.current = true;
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="table-info">
        <div className="info-spacer" />
        <div className="phase-stack">
          <div className="phase-chip">
            <span className="phase-label">Phase</span>
          <span className="phase-value">{toTitleCase(update.game.phase)}</span>
          </div>
          {showTopCountdown && topCountdownValue > 0 ? (
            <div className="phase-chip">
              <span className="phase-label">Time</span>
              <span className="phase-value">{formatCountdown(topCountdownValue)}</span>
            </div>
          ) : null}
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
            disabled={
              (update.game.phase === "lobby" && (!canStart || update.game.players.length < 3)) ||
              (update.game.phase === "night" && (nightCountdown > 0 || (isParallelNight && autoAdvanceNight))) ||
              (update.game.phase === "parallelResult" && phaseCountdown > 0) ||
              update.game.phase === "nightCountdown"
            }
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
                <span className="pill">Phase: {toTitleCase(update.game.phase)}</span>
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
                      const step = pairedRoles.has(role) ? 2 : 1;
                      const nextCount = Math.min(cap, count + step);
                      const delta = nextCount - count;
                      const maxedOverall = countsToArray(roleCounts).length + delta > requiredRoles;
                      const capReached = delta <= 0;
                      return (
                        <div key={role} className="role-chip">
                          <span className="pill small">{displayRole(role)}</span>
                          <div className="role-buttons">
                            <button
                              className="button tiny"
                              type="button"
                              onClick={() => {
                                if (count === 0) return;
                                tryAdjustRoleCount(role, "dec");
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
                                if (capReached || maxedOverall) return;
                                tryAdjustRoleCount(role, "inc");
                              }}
                              disabled={capReached || maxedOverall}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={update.game.settings.parallelNight}
                      onChange={(e) =>
                        socket.emit("host:updateSettings", {
                          roomCode: update.roomCode,
                          hostPlayerId: update.you.playerId,
                          settings: { parallelNight: e.target.checked },
                        })
                      }
                    />
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                    <span className="toggle-label">
                      Parallel night
                      <span
                        className="help-icon"
                        data-tooltip="Everyone performs their night action at once; results are revealed after 10 seconds."
                      >
                        ?
                      </span>
                    </span>
                  </label>
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
                  <div className="panel-body players-inline">{renderPlayerCards({ showKick: true })}</div>
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
