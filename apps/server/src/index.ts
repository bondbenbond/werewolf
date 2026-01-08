import { createServer } from "http";
import { randomBytes } from "crypto";
import { Server, Socket } from "socket.io";
import {
  DEFAULT_GAME_SETTINGS,
  GameSettings,
  GameState,
  Player,
  PrivateView,
  Role,
  RolesState,
  TokensState,
  VotingState,
  applyRobberSwap,
  applyTroublemakerSwap,
  computeElimination,
  computeVoteTally,
  computeWinners,
  eligiblePlayersForNightRole,
  getCurrentRole,
  getOriginalRole,
  isHost,
  isPhase,
  isPlayerAloneWerewolf,
  now,
  shuffle,
  NIGHT_ORDER,
  createEmptyTokensState,
  createEmptyVotingState,
} from "@werewolf/shared";

type RoomContext = {
  state: GameState;
  privateViews: Record<string, PrivateView>;
  nightSteps: Role[];
};

type SocketRef = { roomCode: string; playerId: string };

const PORT = Number(process.env.PORT ?? 4000);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const log = (...args: unknown[]) => {
  console.log(new Date().toISOString(), "[server]", ...args);
};

const rooms = new Map<string, RoomContext>();
const socketLookup = new Map<string, SocketRef>();

const sendError = (socket: Socket, code: string, message: string) => {
  socket.emit("error", { code, message });
};

const generateRoomCode = () => randomBytes(3).toString("hex").slice(0, 6).toUpperCase();
const generateId = () => randomBytes(8).toString("hex");
const generateSecret = () => randomBytes(12).toString("hex");

const createPlayer = (name: string): Player => ({
  playerId: generateId(),
  name,
  connected: true,
  ready: false,
  resumeSecret: generateSecret(),
});

const createRoomState = (roomCode: string, host: Player, maxPlayers: number): GameState => ({
  roomCode,
  hostPlayerId: host.playerId,
  gameName: `Room ${roomCode}`,
  phase: "lobby",
  maxPlayers,
  playersById: { [host.playerId]: host },
  playerOrder: [host.playerId],
  settings: { ...DEFAULT_GAME_SETTINGS },
  roleSelection: { roles: [] },
  createdAt: now(),
  updatedAt: now(),
});

const ensureRoom = (roomCode: string): RoomContext | undefined => rooms.get(roomCode);

const touch = (state: GameState) => {
  state.updatedAt = now();
};

const buildRoomPublicState = (state: GameState) => {
  const players = state.playerOrder.map((playerId) => {
    const player = state.playersById[playerId];
    return {
      playerId,
      name: player?.name ?? "Player",
      connected: player?.connected ?? false,
      ready: player?.ready ?? false,
      hasVoted: !!state.voting?.votesByPlayer[playerId],
    };
  });

  const dealAcks = state.deal?.ackByPlayer;
  const night = state.night
    ? {
        stepRole: state.night.stepRole,
        completedThisStep: state.night.completionByPlayer,
        stepIndex: state.night.stepIndex,
        totalSteps: state.night.totalSteps,
      }
    : undefined;

  const tokens = state.tokens
    ? {
        tokensByPlayer: state.tokens.tokensByPlayer,
        suspectRolesByPlayer: state.tokens.suspectRolesByPlayer,
      }
    : undefined;

  const voting = state.voting
    ? {
        locked: state.voting.locked,
        tally: computeVoteTally(state),
      }
    : undefined;

  const reveal = state.reveal
    ? {
        eliminatedPlayerId: state.reveal.eliminatedPlayerId,
        winners: state.reveal.winners,
        finalRoles: state.reveal.finalRolesByPlayer,
        centerRoles: state.reveal.centerRoles,
      }
    : undefined;

  return {
    phase: state.phase,
    gameName: state.gameName,
    maxPlayers: state.maxPlayers,
    hostPlayerId: state.hostPlayerId,
    players,
    roleSelection: state.roleSelection.roles,
    settings: state.settings,
    dealAcks,
    night,
    tokens,
    voting,
    reveal,
  };
};

const emitRoomUpdate = async (room: RoomContext) => {
  const { state, privateViews } = room;
  for (const playerId of state.playerOrder) {
    const player = state.playersById[playerId];
    if (!player?.socketId) continue;
    const socket = io.sockets.sockets.get(player.socketId);
    if (!socket) continue;

    socket.emit("game:update", {
      roomCode: state.roomCode,
      you: {
        playerId,
        name: player.name,
        isHost: isHost(state, playerId),
        connected: player.connected,
        ready: player.ready,
        originalRole: getOriginalRole(state, playerId),
      },
      game: buildRoomPublicState(state),
      private: privateViews[playerId] ?? { kind: "none" },
    });
  }
};

const setPrivateView = (room: RoomContext, playerId: string, view: PrivateView) => {
  room.privateViews[playerId] = view;
};

const resetPrivateViews = (room: RoomContext) => {
  room.privateViews = {};
};

const resetVoting = (state: GameState): VotingState => {
  const voting: VotingState = createEmptyVotingState();
  voting.votesByPlayer = Object.fromEntries(state.playerOrder.map((id) => [id, null]));
  return voting;
};

const resetTokens = (): TokensState => createEmptyTokensState();

const buildNightSteps = (state: GameState): Role[] => {
  if (!state.roles) return [];
  const presentRoles = new Set<Role>([
    ...Object.values(state.roles.originalRolesByPlayer),
    ...state.roles.centerRoles,
  ]);
  return NIGHT_ORDER.filter((role) => presentRoles.has(role));
};

const setWerewolfPrivateViews = (room: RoomContext) => {
  if (!room.state.roles) return;
  const wolves = eligiblePlayersForNightRole(room.state, "werewolf");
  wolves.forEach((wolfId) => {
    const others = wolves.filter((id) => id !== wolfId);
    setPrivateView(room, wolfId, { kind: "werewolfSawWerewolves", werewolfIds: others });
  });
};

const DEFAULT_ROLE_POOL: Role[] = [
  "werewolf",
  "werewolf",
  "minion",
  "mason",
  "mason",
  "seer",
  "robber",
  "troublemaker",
  "insomniac",
  "villager",
  "villager",
];

const buildDefaultDeck = (playerCount: number): Role[] => {
  const needed = playerCount + 3;
  const pool: Role[] = [...DEFAULT_ROLE_POOL];
  while (pool.length < needed) {
    pool.push("villager");
  }
  return shuffle(pool).slice(0, needed);
};

const assignRoles = (state: GameState) => {
  const playerCount = state.playerOrder.length;
  const deck =
    state.roleSelection.roles.length === playerCount + 3
      ? [...state.roleSelection.roles]
      : buildDefaultDeck(playerCount);
  if (deck.length !== playerCount + 3) {
    throw new Error("Invalid role selection");
  }
  const shuffled = shuffle(deck);
  const center = shuffled.splice(playerCount, 3) as [Role, Role, Role];
  const originalRolesByPlayer: Record<string, Role> = {};
  state.playerOrder.forEach((playerId, idx) => {
    originalRolesByPlayer[playerId] = shuffled[idx];
  });
  const roles: RolesState = {
    originalRolesByPlayer,
    currentRolesByPlayer: { ...originalRolesByPlayer },
    centerRoles: center,
  };
  state.roles = roles;
};

const transitionToDiscussion = (room: RoomContext) => {
  room.state.phase = "discussion";
  room.state.night = undefined;
  touch(room.state);
};

const attachSocketToPlayer = (socket: Socket, room: RoomContext, playerId: string) => {
  const player = room.state.playersById[playerId];
  if (!player) return;
  player.socketId = socket.id;
  player.connected = true;
  socketLookup.set(socket.id, { roomCode: room.state.roomCode, playerId });
  socket.join(room.state.roomCode);
};

const clearSocketRef = (socketId: string) => {
  socketLookup.delete(socketId);
};

io.on("connection", (socket) => {
  log("socket connected", socket.id);

  socket.on("disconnect", () => {
    log("socket disconnected", socket.id);
    const ref = socketLookup.get(socket.id);
    if (!ref) return;
    const room = ensureRoom(ref.roomCode);
    if (!room) return;
    const player = room.state.playersById[ref.playerId];
    if (player) {
      player.connected = false;
      player.socketId = undefined;
      touch(room.state);
      emitRoomUpdate(room);
    }
    clearSocketRef(socket.id);
  });

  socket.on("room:create", (payload: { gameName?: string; maxPlayers: number; name?: string }, ack?: (resp: { playerId: string; resumeSecret: string; roomCode: string }) => void) => {
    const maxPlayers = Math.min(Math.max(payload?.maxPlayers ?? 8, 3), 10);
    const host = createPlayer(payload.name?.trim() || "Host");
    const roomCode = generateRoomCode();
    const state = createRoomState(roomCode, host, maxPlayers);
    state.gameName = payload?.gameName ?? state.gameName;
    log("room:create", { roomCode, maxPlayers, gameName: state.gameName, hostId: host.playerId });

    const room: RoomContext = { state, privateViews: {}, nightSteps: [] };
    rooms.set(roomCode, room);

    attachSocketToPlayer(socket, room, host.playerId);
    emitRoomUpdate(room);
    ack?.({ playerId: host.playerId, resumeSecret: host.resumeSecret, roomCode });
  });

  socket.on("room:join", (payload: { roomCode: string; name: string }, ack?: (resp: { playerId: string; resumeSecret: string; roomCode: string }) => void) => {
    log("room:join", { roomCode: payload.roomCode, name: payload.name });
    const room = ensureRoom(payload.roomCode);
    if (!room) return sendError(socket, "ROOM_NOT_FOUND", "Room not found.");
    if (!isPhase(room.state, "lobby")) {
      return sendError(socket, "ROOM_IN_PROGRESS", "Game already started.");
    }
    if (room.state.playerOrder.length >= room.state.maxPlayers) {
      return sendError(socket, "ROOM_FULL", "Room is full.");
    }
    const name = (payload.name || "Player").trim().slice(0, 24);
    if (!name) return sendError(socket, "INVALID_PAYLOAD", "Name required.");

    const player = createPlayer(name);
    room.state.playersById[player.playerId] = player;
    room.state.playerOrder.push(player.playerId);
    touch(room.state);

    attachSocketToPlayer(socket, room, player.playerId);
    emitRoomUpdate(room);
    ack?.({ playerId: player.playerId, resumeSecret: player.resumeSecret, roomCode: room.state.roomCode });
  });

  socket.on(
    "session:resume",
    (
      payload: { roomCode: string; playerId: string; resumeSecret: string },
      ack?: (resp: { ok: boolean }) => void
    ) => {
      log("session:resume", { roomCode: payload.roomCode, playerId: payload.playerId });
      const room = ensureRoom(payload.roomCode);
      if (!room) {
        sendError(socket, "ROOM_NOT_FOUND", "Room not found.");
        ack?.({ ok: false });
        return;
      }
      const player = room.state.playersById[payload.playerId];
      if (!player || player.resumeSecret !== payload.resumeSecret) {
        sendError(socket, "PLAYER_NOT_FOUND", "Resume credentials invalid.");
        ack?.({ ok: false });
        return;
      }
      attachSocketToPlayer(socket, room, player.playerId);
      emitRoomUpdate(room);
      ack?.({ ok: true });
    }
  );

  socket.on("room:leave", (payload: { roomCode: string; playerId: string }) => {
    log("room:leave", payload);
    const room = ensureRoom(payload.roomCode);
    if (!room) return;
    const player = room.state.playersById[payload.playerId];
    if (!player) return;

    const isHostPlayer = room.state.hostPlayerId === payload.playerId;

    if (isHostPlayer) {
      io.to(room.state.roomCode).emit("game:end");
      // clean lookup and remove room
      for (const [sid, ref] of socketLookup.entries()) {
        if (ref.roomCode === room.state.roomCode) {
          socketLookup.delete(sid);
        }
      }
      rooms.delete(room.state.roomCode);
      return;
    }

    if (isPhase(room.state, "lobby")) {
      delete room.state.playersById[payload.playerId];
      room.state.playerOrder = room.state.playerOrder.filter((id) => id !== payload.playerId);
    } else {
      player.connected = false;
    }
    touch(room.state);
    emitRoomUpdate(room);
  });

  socket.on("lobby:setName", (payload: { roomCode: string; playerId: string; name: string }) => {
    log("lobby:setName", payload);
    const room = ensureRoom(payload.roomCode);
    if (!room) return;
    if (!isPhase(room.state, "lobby")) {
      return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Cannot rename after game start.");
    }
    const player = room.state.playersById[payload.playerId];
    if (!player) return sendError(socket, "PLAYER_NOT_FOUND", "Player missing.");
    const name = (payload.name || "").trim().slice(0, 24);
    if (!name) return sendError(socket, "INVALID_PAYLOAD", "Name required.");
    player.name = name;
    touch(room.state);
    emitRoomUpdate(room);
  });

  socket.on(
    "lobby:setReady",
    (payload: { roomCode: string; playerId: string; ready: boolean }) => {
      log("lobby:setReady", payload);
      const room = ensureRoom(payload.roomCode);
      if (!room) return;
      const player = room.state.playersById[payload.playerId];
      if (!player) return sendError(socket, "PLAYER_NOT_FOUND", "Player missing.");
      player.ready = !!payload.ready;
      touch(room.state);
      emitRoomUpdate(room);
    }
  );

  socket.on(
    "host:updateSettings",
    (payload: { roomCode: string; hostPlayerId: string; settings: GameSettings }) => {
      log("host:updateSettings", { roomCode: payload.roomCode, host: payload.hostPlayerId });
      const room = ensureRoom(payload.roomCode);
      if (!room) return;
      if (!isHost(room.state, payload.hostPlayerId)) {
        return sendError(socket, "NOT_HOST", "Host only.");
      }
      if (!isPhase(room.state, "lobby")) {
        return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Settings locked after start.");
      }
      room.state.settings = { ...room.state.settings, ...payload.settings };
      touch(room.state);
      emitRoomUpdate(room);
    }
  );

  socket.on(
    "host:updateRoles",
    (payload: { roomCode: string; hostPlayerId: string; roles: Role[] }) => {
      log("host:updateRoles", { roomCode: payload.roomCode, host: payload.hostPlayerId, count: payload.roles.length });
      const room = ensureRoom(payload.roomCode);
      if (!room) return;
      if (!isHost(room.state, payload.hostPlayerId)) {
        return sendError(socket, "NOT_HOST", "Host only.");
      }
      if (!isPhase(room.state, "lobby")) {
        return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Cannot change roles after start.");
      }
      const allowed: Role[] = [
        "villager",
        "werewolf",
        "minion",
        "mason",
        "seer",
        "robber",
        "troublemaker",
        "insomniac",
      ];
      if (!payload.roles.every((r) => allowed.includes(r))) {
        return sendError(socket, "INVALID_PAYLOAD", "Invalid role in selection.");
      }
      const needed = room.state.playerOrder.length + 3;
      if (payload.roles.length !== needed) {
        return sendError(socket, "INVALID_PAYLOAD", `Select exactly ${needed} roles (players + 3).`);
      }
      room.state.roleSelection = { roles: payload.roles };
      touch(room.state);
      emitRoomUpdate(room);
    }
  );

  socket.on("host:startGame", (payload: { roomCode: string; hostPlayerId: string }) => {
    log("host:startGame", payload);
    const room = ensureRoom(payload.roomCode);
    if (!room) return;
    if (!isHost(room.state, payload.hostPlayerId)) {
      return sendError(socket, "NOT_HOST", "Host only.");
    }
    if (!isPhase(room.state, "lobby")) {
      return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Already started.");
    }
    if (room.state.playerOrder.length < 3) {
      return sendError(socket, "INVALID_PAYLOAD", "Need at least 3 players.");
    }
    const allReady = room.state.playerOrder.every(
      (id) => id === payload.hostPlayerId || room.state.playersById[id]?.ready
    );
    if (!allReady) {
      return sendError(socket, "INVALID_PAYLOAD", "All players must be ready.");
    }
    const requiredRoles = room.state.playerOrder.length + 3;
    if (room.state.roleSelection.roles.length !== requiredRoles) {
      return sendError(socket, "INVALID_PAYLOAD", `Select exactly ${requiredRoles} roles.`);
    }

    try {
      assignRoles(room.state);
    } catch (err) {
      return sendError(
        socket,
        "INVALID_PAYLOAD",
        err instanceof Error ? err.message : "Invalid roles."
      );
    }

    room.state.deal = { ackByPlayer: Object.fromEntries(room.state.playerOrder.map((id) => [id, false])) };
    room.state.tokens = resetTokens();
    room.state.voting = resetVoting(room.state);
    resetPrivateViews(room);
    room.nightSteps = buildNightSteps(room.state);
    room.state.night = undefined;
    room.state.phase = "deal";
    touch(room.state);
    emitRoomUpdate(room);
  });

  socket.on("player:ackRole", (payload: { roomCode: string; playerId: string }) => {
    log("player:ackRole", payload);
    const room = ensureRoom(payload.roomCode);
    if (!room) return;
    if (!isPhase(room.state, "deal")) {
      return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Not in deal phase.");
    }
    if (!room.state.deal) return;
    if (!room.state.deal.ackByPlayer[payload.playerId]) {
      room.state.deal.ackByPlayer[payload.playerId] = true;
      touch(room.state);
      emitRoomUpdate(room);
    }
  });

  socket.on("host:startNight", (payload: { roomCode: string; hostPlayerId: string }) => {
    log("host:startNight", payload);
    const room = ensureRoom(payload.roomCode);
    if (!room) return;
    if (!isHost(room.state, payload.hostPlayerId)) {
      return sendError(socket, "NOT_HOST", "Host only.");
    }
    if (!isPhase(room.state, "deal")) {
      return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Must be in deal phase.");
    }

    room.nightSteps = buildNightSteps(room.state);
    if (room.nightSteps.length === 0) {
      transitionToDiscussion(room);
      emitRoomUpdate(room);
      return;
    }

    const stepRole = room.nightSteps[0];
    const completionByPlayer: Record<string, boolean> = {};
    eligiblePlayersForNightRole(room.state, stepRole).forEach((id) => {
      completionByPlayer[id] = false;
    });

    room.state.night = {
      stepIndex: 0,
      stepRole,
      totalSteps: room.nightSteps.length,
      completionByPlayer,
    };
    room.state.phase = "night";
    resetPrivateViews(room);
    if (stepRole === "werewolf") {
      setWerewolfPrivateViews(room);
    }
    touch(room.state);
    emitRoomUpdate(room);
  });

  socket.on("host:advanceNightStep", (payload: { roomCode: string; hostPlayerId: string }) => {
    log("host:advanceNightStep", payload);
    const room = ensureRoom(payload.roomCode);
    if (!room) return;
    if (!isHost(room.state, payload.hostPlayerId)) {
      return sendError(socket, "NOT_HOST", "Host only.");
    }
    if (!isPhase(room.state, "night")) {
      return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Not in night phase.");
    }
    if (!room.state.night) return;

    const nextIndex = room.state.night.stepIndex + 1;
    if (nextIndex >= room.nightSteps.length) {
      transitionToDiscussion(room);
      emitRoomUpdate(room);
      return;
    }

    const stepRole = room.nightSteps[nextIndex];
    const completionByPlayer: Record<string, boolean> = {};
    eligiblePlayersForNightRole(room.state, stepRole).forEach((id) => {
      completionByPlayer[id] = false;
    });

    room.state.night = {
      stepIndex: nextIndex,
      stepRole,
      totalSteps: room.nightSteps.length,
      completionByPlayer,
    };
    resetPrivateViews(room);
    if (stepRole === "werewolf") {
      setWerewolfPrivateViews(room);
    }
    touch(room.state);
    emitRoomUpdate(room);
  });

  socket.on("night:action:done", (payload: { roomCode: string; playerId: string }) => {
    log("night:action:done", payload);
    const room = ensureRoom(payload.roomCode);
    if (!room || !room.state.night) return;
    if (!isPhase(room.state, "night")) return;
    const stepRole = room.state.night.stepRole;
    if (!stepRole) return;
    const player = room.state.playersById[payload.playerId];
    if (!player) return sendError(socket, "PLAYER_NOT_FOUND", "Player missing.");
    const eligible = eligiblePlayersForNightRole(room.state, stepRole);
    if (!eligible.includes(payload.playerId)) {
      return sendError(socket, "INVALID_TARGET", "Not your step.");
    }
    if (room.state.night.completionByPlayer[payload.playerId]) {
      return sendError(socket, "ALREADY_SUBMITTED", "Already completed.");
    }
    if (stepRole === "mason") {
      const masonIds = eligible.filter((id) => id !== payload.playerId);
      setPrivateView(room, payload.playerId, { kind: "masonSawMasons", masonIds });
    }
    if (stepRole === "minion") {
      const wolves = eligiblePlayersForNightRole(room.state, "werewolf");
      setPrivateView(room, payload.playerId, { kind: "minionSawWerewolves", werewolfIds: wolves });
    }
    room.state.night.completionByPlayer[payload.playerId] = true;
    touch(room.state);
    emitRoomUpdate(room);
  });

  socket.on(
    "night:werewolf:soloPeek",
    (payload: { roomCode: string; playerId: string; centerIndex: 0 | 1 | 2 }) => {
      log("night:werewolf:soloPeek", payload);
      const room = ensureRoom(payload.roomCode);
      if (!room || !room.state.night || !room.state.roles) return;
      if (!isPhase(room.state, "night")) return;
      const playerId = payload.playerId;
      if (room.state.night.stepRole !== "werewolf") {
        return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Wrong night step.");
      }
      if (!isPlayerAloneWerewolf(room.state, playerId)) {
        return sendError(socket, "INVALID_TARGET", "Only a lone werewolf may peek.");
      }
      if (room.state.night.completionByPlayer[playerId]) {
        return sendError(socket, "ALREADY_SUBMITTED", "Already completed.");
      }
      const centerRole = room.state.roles.centerRoles[payload.centerIndex];
      setPrivateView(room, playerId, {
        kind: "werewolfSoloPeek",
        centerIndex: payload.centerIndex,
        role: centerRole,
      });
      room.state.night.completionByPlayer[playerId] = true;
      touch(room.state);
      emitRoomUpdate(room);
    }
  );

  socket.on(
    "night:seer:viewPlayer",
    (payload: { roomCode: string; playerId: string; targetPlayerId: string }) => {
      log("night:seer:viewPlayer", payload);
      const room = ensureRoom(payload.roomCode);
      if (!room || !room.state.night || !room.state.roles) return;
      if (room.state.night.stepRole !== "seer") {
        return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Wrong night step.");
      }
      const eligible = eligiblePlayersForNightRole(room.state, "seer");
      if (!eligible.includes(payload.playerId)) {
        return sendError(socket, "INVALID_TARGET", "Not your action.");
      }
      if (room.state.night.completionByPlayer[payload.playerId]) {
        return sendError(socket, "ALREADY_SUBMITTED", "Already completed.");
      }
      const role = getCurrentRole(room.state, payload.targetPlayerId);
      if (!role) return sendError(socket, "PLAYER_NOT_FOUND", "Target missing.");

      setPrivateView(room, payload.playerId, {
        kind: "seerViewPlayer",
        targetPlayerId: payload.targetPlayerId,
        role,
      });
      room.state.night.completionByPlayer[payload.playerId] = true;
      touch(room.state);
      emitRoomUpdate(room);
    }
  );

  socket.on(
    "night:seer:viewCenter",
    (payload: { roomCode: string; playerId: string; centerIndices: [0 | 1 | 2, 0 | 1 | 2] }) => {
      log("night:seer:viewCenter", payload);
      const room = ensureRoom(payload.roomCode);
      if (!room || !room.state.night || !room.state.roles) return;
      if (room.state.night.stepRole !== "seer") {
        return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Wrong night step.");
      }
      const eligible = eligiblePlayersForNightRole(room.state, "seer");
      if (!eligible.includes(payload.playerId)) {
        return sendError(socket, "INVALID_TARGET", "Not your action.");
      }
      if (room.state.night.completionByPlayer[payload.playerId]) {
        return sendError(socket, "ALREADY_SUBMITTED", "Already completed.");
      }
      const [a, b] = payload.centerIndices;
      if (a === b) return sendError(socket, "INVALID_PAYLOAD", "Indices must differ.");
      const results = [
        { centerIndex: a, role: room.state.roles.centerRoles[a] },
        { centerIndex: b, role: room.state.roles.centerRoles[b] },
      ];
      setPrivateView(room, payload.playerId, { kind: "seerViewCenter", center: results });
      room.state.night.completionByPlayer[payload.playerId] = true;
      touch(room.state);
      emitRoomUpdate(room);
    }
  );

  socket.on(
    "night:robber:swap",
    (payload: { roomCode: string; playerId: string; targetPlayerId: string }) => {
      log("night:robber:swap", payload);
      const room = ensureRoom(payload.roomCode);
      if (!room || !room.state.night) return;
      if (room.state.night.stepRole !== "robber") {
        return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Wrong night step.");
      }
      const eligible = eligiblePlayersForNightRole(room.state, "robber");
      if (!eligible.includes(payload.playerId)) {
        return sendError(socket, "INVALID_TARGET", "Not your action.");
      }
      if (room.state.night.completionByPlayer[payload.playerId]) {
        return sendError(socket, "ALREADY_SUBMITTED", "Already completed.");
      }
      const newRole = applyRobberSwap(room.state, payload.playerId, payload.targetPlayerId);
      if (!newRole) return sendError(socket, "INVALID_TARGET", "Swap failed.");
      setPrivateView(room, payload.playerId, { kind: "robberNewRole", role: newRole });
      room.state.night.completionByPlayer[payload.playerId] = true;
      touch(room.state);
      emitRoomUpdate(room);
    }
  );

  socket.on(
    "night:troublemaker:swap",
    (payload: { roomCode: string; playerId: string; targetPlayerIds: [string, string] }) => {
      log("night:troublemaker:swap", payload);
      const room = ensureRoom(payload.roomCode);
      if (!room || !room.state.night) return;
      if (room.state.night.stepRole !== "troublemaker") {
        return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Wrong night step.");
      }
      const eligible = eligiblePlayersForNightRole(room.state, "troublemaker");
      if (!eligible.includes(payload.playerId)) {
        return sendError(socket, "INVALID_TARGET", "Not your action.");
      }
      if (room.state.night.completionByPlayer[payload.playerId]) {
        return sendError(socket, "ALREADY_SUBMITTED", "Already completed.");
      }
      const [a, b] = payload.targetPlayerIds;
      if (a === b) return sendError(socket, "INVALID_PAYLOAD", "Targets must differ.");
      if (!room.state.playersById[a] || !room.state.playersById[b]) {
        return sendError(socket, "PLAYER_NOT_FOUND", "Target missing.");
      }
      applyTroublemakerSwap(room.state, a, b);
      room.state.night.completionByPlayer[payload.playerId] = true;
      touch(room.state);
      emitRoomUpdate(room);
    }
  );

  socket.on("night:insomniac:peekFinal", (payload: { roomCode: string; playerId: string }) => {
    log("night:insomniac:peekFinal", payload);
    const room = ensureRoom(payload.roomCode);
    if (!room || !room.state.night) return;
    if (room.state.night.stepRole !== "insomniac") {
      return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Wrong night step.");
    }
    const eligible = eligiblePlayersForNightRole(room.state, "insomniac");
    if (!eligible.includes(payload.playerId)) {
      return sendError(socket, "INVALID_TARGET", "Not your action.");
    }
    if (room.state.night.completionByPlayer[payload.playerId]) {
      return sendError(socket, "ALREADY_SUBMITTED", "Already completed.");
    }
    const role = getCurrentRole(room.state, payload.playerId);
    if (!role) return sendError(socket, "PLAYER_NOT_FOUND", "Player missing.");
    setPrivateView(room, payload.playerId, { kind: "insomniacFinalRole", role });
    room.state.night.completionByPlayer[payload.playerId] = true;
    touch(room.state);
    emitRoomUpdate(room);
  });

  socket.on("host:startVoting", (payload: { roomCode: string; hostPlayerId: string }) => {
    log("host:startVoting", payload);
    const room = ensureRoom(payload.roomCode);
    if (!room) return;
    if (!isHost(room.state, payload.hostPlayerId)) {
      return sendError(socket, "NOT_HOST", "Host only.");
    }
    if (!isPhase(room.state, "discussion")) {
      return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Must be in discussion.");
    }
    room.state.phase = "voting";
    room.state.voting = resetVoting(room.state);
    touch(room.state);
    emitRoomUpdate(room);
  });

  socket.on(
    "host:lockVotes",
    (payload: { roomCode: string; hostPlayerId: string; locked: boolean }) => {
      log("host:lockVotes", payload);
      const room = ensureRoom(payload.roomCode);
      if (!room) return;
      if (!isHost(room.state, payload.hostPlayerId)) {
        return sendError(socket, "NOT_HOST", "Host only.");
      }
      if (!isPhase(room.state, "voting")) {
        return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Not in voting.");
      }
      if (!room.state.voting) return;
      room.state.voting.locked = !!payload.locked;
      touch(room.state);
      emitRoomUpdate(room);
    }
  );

  socket.on(
    "vote:submit",
    (payload: { roomCode: string; playerId: string; targetPlayerId: string }) => {
      log("vote:submit", payload);
      const room = ensureRoom(payload.roomCode);
      if (!room || !room.state.voting) return;
      if (!isPhase(room.state, "voting")) {
        return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Not in voting.");
      }
      const voting = room.state.voting;
      if (voting.locked) return sendError(socket, "VOTING_LOCKED", "Votes are locked.");
      const player = room.state.playersById[payload.playerId];
      if (!player) return sendError(socket, "PLAYER_NOT_FOUND", "Player missing.");
      if (!room.state.playersById[payload.targetPlayerId]) {
        return sendError(socket, "INVALID_TARGET", "Target missing.");
      }
      if (!room.state.settings.allowVoteChanges && voting.votesByPlayer[payload.playerId]) {
        return sendError(socket, "INVALID_PAYLOAD", "Vote already submitted.");
      }
      voting.votesByPlayer[payload.playerId] = payload.targetPlayerId;
      touch(room.state);
      emitRoomUpdate(room);
    }
  );

  socket.on("host:reveal", (payload: { roomCode: string; hostPlayerId: string }) => {
    log("host:reveal", payload);
    const room = ensureRoom(payload.roomCode);
    if (!room) return;
    if (!isHost(room.state, payload.hostPlayerId)) {
      return sendError(socket, "NOT_HOST", "Host only.");
    }
    if (!isPhase(room.state, "voting")) {
      return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Reveal after voting.");
    }
    const tally = computeVoteTally(room.state);
    const eliminatedPlayerId = computeElimination(tally);
    const winners = computeWinners(room.state, eliminatedPlayerId);
    const reveal = {
      tally,
      eliminatedPlayerId,
      winners,
      finalRolesByPlayer: room.state.roles?.currentRolesByPlayer ?? {},
      centerRoles:
        room.state.roles?.centerRoles ?? (["villager", "villager", "villager"] as [Role, Role, Role]),
    };
    room.state.reveal = reveal;
    room.state.phase = "reveal";
    touch(room.state);
    emitRoomUpdate(room);
  });

  socket.on("host:resetGame", (payload: { roomCode: string; hostPlayerId: string }) => {
    log("host:resetGame", payload);
    const room = ensureRoom(payload.roomCode);
    if (!room) return;
    if (!isHost(room.state, payload.hostPlayerId)) {
      return sendError(socket, "NOT_HOST", "Host only.");
    }
    room.state.phase = "lobby";
    room.state.roles = undefined;
    room.state.deal = undefined;
    room.state.night = undefined;
    room.state.voting = undefined;
    room.state.reveal = undefined;
    room.state.tokens = resetTokens();
    room.state.playersById = Object.fromEntries(
      room.state.playerOrder.map((id) => {
        const player = room.state.playersById[id];
        return [
          id,
          {
            ...player,
            ready: false,
          },
        ];
      })
    );
    resetPrivateViews(room);
    touch(room.state);
    emitRoomUpdate(room);
  });

  socket.on(
    "discussion:token:add",
    (payload: { roomCode: string; playerId: string; targetPlayerId: string; role?: Role }) => {
      log("discussion:token:add", payload);
      const room = ensureRoom(payload.roomCode);
      if (!room || !room.state.tokens) return;
      if (!isPhase(room.state, "discussion") && !isPhase(room.state, "voting")) {
        return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Tokens only during discussion/voting.");
      }
      if (!room.state.settings.tokensEnabled) {
        return sendError(socket, "INVALID_PAYLOAD", "Tokens disabled.");
      }
      if (payload.playerId === payload.targetPlayerId) {
        return sendError(socket, "INVALID_TARGET", "Cannot target self.");
      }
      if (!room.state.playersById[payload.targetPlayerId]) {
        return sendError(socket, "INVALID_TARGET", "Target missing.");
      }
      const ownerTokens =
        room.state.tokens.tokensByPlayer[payload.playerId] ??
        (room.state.tokens.tokensByPlayer[payload.playerId] = {});
      const ownerSuspect =
        room.state.tokens.suspectRolesByPlayer[payload.playerId] ??
        (room.state.tokens.suspectRolesByPlayer[payload.playerId] = {});

      const clearAssignment = (ownerId: string, targetId: string) => {
        if (room.state.tokens.tokensByPlayer[ownerId]) {
          delete room.state.tokens.tokensByPlayer[ownerId][targetId];
          if (Object.keys(room.state.tokens.tokensByPlayer[ownerId]).length === 0) {
            delete room.state.tokens.tokensByPlayer[ownerId];
          }
        }
        if (room.state.tokens.suspectRolesByPlayer[ownerId]) {
          delete room.state.tokens.suspectRolesByPlayer[ownerId][targetId];
          if (Object.keys(room.state.tokens.suspectRolesByPlayer[ownerId]).length === 0) {
            delete room.state.tokens.suspectRolesByPlayer[ownerId];
          }
        }
      };

      if (payload.role) {
        const existingForTarget = ownerSuspect[payload.targetPlayerId];
        if (existingForTarget === payload.role) {
          clearAssignment(payload.playerId, payload.targetPlayerId);
          touch(room.state);
          emitRoomUpdate(room);
          return;
        }
        // Ensure only one assignment per role globally
        Object.entries(room.state.tokens.suspectRolesByPlayer).forEach(([ownerId, mapping]) => {
          Object.entries(mapping).forEach(([targetId, role]) => {
            if (role === payload.role && !(ownerId === payload.playerId && targetId === payload.targetPlayerId)) {
              clearAssignment(ownerId, targetId);
            }
          });
        });
      }

      const totalUsed = Object.values(ownerTokens).reduce((sum, n) => sum + n, 0);
      if (totalUsed >= room.state.settings.tokensPerPlayerLimit) {
        return sendError(socket, "LIMIT_EXCEEDED", "Token limit reached.");
      }

      ownerTokens[payload.targetPlayerId] = 1;
      if (payload.role) {
        ownerSuspect[payload.targetPlayerId] = payload.role;
      }
      touch(room.state);
      emitRoomUpdate(room);
    }
  );

  socket.on(
    "discussion:token:remove",
    (payload: { roomCode: string; playerId: string; targetPlayerId: string }) => {
      log("discussion:token:remove", payload);
      const room = ensureRoom(payload.roomCode);
      if (!room || !room.state.tokens) return;
      if (!isPhase(room.state, "discussion") && !isPhase(room.state, "voting")) {
        return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Tokens only during discussion/voting.");
      }
      const ownerTokens = room.state.tokens.tokensByPlayer[payload.playerId];
      const ownerSuspect = room.state.tokens.suspectRolesByPlayer[payload.playerId];
      if (!ownerTokens || !ownerTokens[payload.targetPlayerId]) return;
      ownerTokens[payload.targetPlayerId] = Math.max(0, (ownerTokens[payload.targetPlayerId] ?? 0) - 1);
      if (ownerTokens[payload.targetPlayerId] === 0 && ownerSuspect) {
        delete ownerSuspect[payload.targetPlayerId];
      }
      touch(room.state);
      emitRoomUpdate(room);
    }
  );

  socket.on("discussion:token:clearAll", (payload: { roomCode: string; playerId: string }) => {
    log("discussion:token:clearAll", payload);
    const room = ensureRoom(payload.roomCode);
    if (!room || !room.state.tokens) return;
    if (!isPhase(room.state, "discussion") && !isPhase(room.state, "voting")) {
      return sendError(socket, "NOT_ALLOWED_IN_PHASE", "Tokens only during discussion/voting.");
    }
    delete room.state.tokens.tokensByPlayer[payload.playerId];
    delete room.state.tokens.suspectRolesByPlayer[payload.playerId];
    touch(room.state);
    emitRoomUpdate(room);
  });
});

httpServer.listen(PORT, () => {
  log(`Socket server listening on :${PORT}`);
});

export { io, rooms };
