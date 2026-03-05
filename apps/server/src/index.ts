import fastify from "fastify";
import cors from "@fastify/cors";
import { randomBytes } from "crypto";
import {
  CenterIndex,
  CommandEnvelope,
  CommandResponse,
  CreateGameResponse,
  Event,
  EventBatch,
  GameSettings,
  GameState,
  JoinGameResponse,
  NightActionPayload,
  NIGHT_ORDER,
  PrivateView,
  PublicGameState,
  RevealState,
  Role,
  RolesState,
  SnapshotResponse,
  TokensState,
  VotingState,
} from "@werewolf/shared";

const PORT = Number(process.env.PORT ?? 4000);
const FASTIFY_LOG_LEVEL = process.env.FASTIFY_LOG_LEVEL ?? "info";

const DEFAULT_SETTINGS: GameSettings = {
  nightStepSeconds: 10,
  parallelResultSeconds: 10,
  discussionSeconds: 300,
  votingSeconds: 20,
  allowVoteChanges: true,
  anonymousVotes: true,
  showActionLogOnReveal: false,
  tokensEnabled: true,
  autoAdvanceNight: true,
  parallelNight: false,
};
const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT ?? 150);
const logJoin = (message: string, details: Record<string, unknown>) => {
  app.log.info(details, `[join] ${message}`);
};
const logGame = (message: string, details: Record<string, unknown>) => {
  app.log.info(details, `[game] ${message}`);
};

type GameRecord = {
  state: GameState;
  version: number;
  events: Event[];
  secrets: Map<string, string>;
  streams: Set<NodeJS.WritableStream>;
  privateStreams: Map<string, Set<NodeJS.WritableStream>>;
  privateViews: Map<string, PrivateView>;
  pendingParallelViews: Map<string, PrivateView>;
  nightSteps: Role[];
  dealTimer?: NodeJS.Timeout;
  nightCountdownTimer?: NodeJS.Timeout;
  nightStepTimer?: NodeJS.Timeout;
  discussionTimer?: NodeJS.Timeout;
  votingTimer?: NodeJS.Timeout;
  parallelResultTimer?: NodeJS.Timeout;
  parallelNightTimer?: NodeJS.Timeout;
  dopplegangerInsomniac: Set<string>;
  historyLimit: number;
};

const games = new Map<string, GameRecord>();

const generateRoomCode = () =>
  Array.from(randomBytes(6))
    .map((byte) => (byte % 10).toString())
    .join("")
    .slice(0, 6);

const generateId = () => randomBytes(8).toString("hex");
const generateSecret = () => randomBytes(12).toString("hex");

const nowIso = () => new Date().toISOString();

const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const canWriteSse = (res: NodeJS.WritableStream) => {
  const stream = res as NodeJS.WritableStream & {
    destroyed?: boolean;
    writableEnded?: boolean;
    writableDestroyed?: boolean;
  };
  return !stream.destroyed && !stream.writableDestroyed && !stream.writableEnded;
};

const pruneStream = (record: GameRecord, stream: NodeJS.WritableStream) => {
  record.streams.delete(stream);
  record.privateStreams.forEach((set, playerId) => {
    set.delete(stream);
    if (set.size === 0) {
      record.privateStreams.delete(playerId);
    }
  });
};

const sendSseSafe = (
  record: GameRecord,
  stream: NodeJS.WritableStream,
  event: string,
  data: unknown
) => {
  if (!canWriteSse(stream)) {
    pruneStream(record, stream);
    return false;
  }
  try {
    stream.write(`event: ${event}\n`);
    stream.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    pruneStream(record, stream);
    return false;
  }
};

const appendEvent = (record: GameRecord, type: string, payload: Record<string, unknown>) => {
  record.version += 1;
  const event: Event = {
    version: record.version,
    type,
    payload,
    createdAt: nowIso(),
  };
  record.events.push(event);
  if (record.events.length > record.historyLimit) {
    record.events.splice(0, record.events.length - record.historyLimit);
  }
  [...record.streams].forEach((stream) => {
    sendSseSafe(record, stream, "public", event);
  });
  return event;
};

const emitPrivate = (record: GameRecord, playerId: string, type: string, payload: Record<string, unknown>) => {
  const event: Event = {
    version: record.version + 1,
    type,
    payload: { ...payload, targetPlayerId: playerId },
    createdAt: nowIso(),
  };
  record.version = event.version;
  record.events.push(event);
  if (record.events.length > record.historyLimit) {
    record.events.splice(0, record.events.length - record.historyLimit);
  }
  const streams = record.privateStreams.get(playerId);
  if (streams) {
    [...streams].forEach((stream) => {
      sendSseSafe(record, stream, "private", event);
    });
  }
  return event;
};

const buildPublicState = (state: GameState): PublicGameState => {
  const nightStepRoles = NIGHT_ORDER.filter((role) => state.roleSelection.roles.includes(role));
  const currentNightIndex =
    state.night?.stepRole !== null && state.night?.stepRole !== undefined
      ? nightStepRoles.indexOf(state.night.stepRole)
      : -1;
  const nextStepRole =
    currentNightIndex >= 0 && currentNightIndex + 1 < nightStepRoles.length
      ? nightStepRoles[currentNightIndex + 1]
      : null;
  const players = state.playerOrder.map((playerId) => {
    const player = state.playersById[playerId];
    return {
      playerId,
      name: player?.name ?? "Player",
      connected: player?.connected ?? false,
      ready: player?.ready ?? false,
    };
  });

  return {
    phase: state.phase,
    phaseEndsAt: state.phaseEndsAt,
    gameName: state.gameName,
    maxPlayers: state.maxPlayers,
    hostPlayerId: state.hostPlayerId,
    players,
    roleSelection: state.roleSelection.roles,
    settings: state.settings,
    tokenPoolByRole: state.tokens?.tokenPoolByRole,
    dealAcks: state.deal?.ackByPlayer,
    night: state.night
      ? {
          stepRole: state.night.stepRole,
          nextStepRole,
          completedThisStep: state.night.completionByPlayer,
          stepIndex: state.night.stepIndex,
          totalSteps: state.night.totalSteps,
          endsAt: state.night.endsAt,
          mode: state.night.mode,
          copiedRoleByPlayer: state.night.copiedRoleByPlayer,
          dopplegangerInsomniacStep: state.night.dopplegangerInsomniacStep,
        }
      : undefined,
    tokens: state.tokens
      ? {
          tokensByPlayer: state.tokens.tokensByPlayer,
          suspectRolesByPlayer: state.tokens.suspectRolesByPlayer,
        }
      : undefined,
    voting: state.voting
      ? {
          locked: state.voting.locked,
          tally: computeVoteTally(state),
        }
      : undefined,
    reveal: state.reveal
      ? {
          eliminatedPlayerIds: state.reveal.eliminatedPlayerIds,
          winners: state.reveal.winners,
          finalRoles: state.reveal.finalRolesByPlayer,
          centerRoles: state.reveal.centerRoles,
          originalRoles: state.roles?.originalRolesByPlayer,
        }
      : undefined,
  };
};

const getOriginalRole = (state: GameState, playerId: string): Role | undefined =>
  state.roles?.originalRolesByPlayer[playerId];

const getCurrentRole = (state: GameState, playerId: string): Role | undefined =>
  state.roles?.currentRolesByPlayer[playerId];

const getDopplegangerCopiedRole = (state: GameState, playerId: string): Role | undefined => {
  const copied = state.night?.copiedRoleByPlayer?.[playerId];
  return copied ?? undefined;
};

const eligiblePlayersForNightRole = (state: GameState, role: Role): string[] => {
  if (!state.roles) return [];
  return Object.entries(state.roles.originalRolesByPlayer)
    .filter(([, originalRole]) => originalRole === role)
    .map(([playerId]) => playerId);
};

const eligiblePlayersForNightStepRole = (state: GameState, role: Role): string[] => {
  const base = eligiblePlayersForNightRole(state, role);
  if (!state.night) return base;
  if (!["werewolf", "mason"].includes(role)) return base;
  const copied = Object.entries(state.night.copiedRoleByPlayer ?? {})
    .filter(([playerId, copiedRole]) => copiedRole === role && getOriginalRole(state, playerId) === "doppleganger")
    .map(([playerId]) => playerId);
  return [...new Set([...base, ...copied])];
};

const isPlayerAloneWerewolf = (state: GameState, playerId: string): boolean => {
  const wolves = eligiblePlayersForNightStepRole(state, "werewolf");
  return wolves.length === 1 && wolves[0] === playerId;
};

const applyRobberSwap = (state: GameState, robberId: string, targetId: string): Role | undefined => {
  const roles = state.roles;
  if (!roles) return undefined;
  const targetRole = roles.currentRolesByPlayer[targetId];
  const robberRole = roles.currentRolesByPlayer[robberId];
  roles.currentRolesByPlayer[targetId] = robberRole;
  roles.currentRolesByPlayer[robberId] = targetRole;
  return targetRole;
};

const applyTroublemakerSwap = (state: GameState, firstId: string, secondId: string) => {
  const roles = state.roles;
  if (!roles) return;
  const aRole = roles.currentRolesByPlayer[firstId];
  roles.currentRolesByPlayer[firstId] = roles.currentRolesByPlayer[secondId];
  roles.currentRolesByPlayer[secondId] = aRole;
};

const applyDrunkSwap = (state: GameState, playerId: string, centerIndex: CenterIndex) => {
  const roles = state.roles;
  if (!roles) return;
  const playerRole = roles.currentRolesByPlayer[playerId];
  const centerRole = roles.centerRoles[centerIndex];
  roles.currentRolesByPlayer[playerId] = centerRole;
  roles.centerRoles[centerIndex] = playerRole;
};

const clearParallelResultTimer = (record: GameRecord) => {
  if (record.parallelResultTimer) {
    clearTimeout(record.parallelResultTimer);
    record.parallelResultTimer = undefined;
  }
};

const clearParallelNightTimer = (record: GameRecord) => {
  if (record.parallelNightTimer) {
    clearTimeout(record.parallelNightTimer);
    record.parallelNightTimer = undefined;
  }
};

const clearDealTimer = (record: GameRecord) => {
  if (record.dealTimer) {
    clearTimeout(record.dealTimer);
    record.dealTimer = undefined;
  }
};

const clearNightCountdownTimer = (record: GameRecord) => {
  if (record.nightCountdownTimer) {
    clearTimeout(record.nightCountdownTimer);
    record.nightCountdownTimer = undefined;
  }
};

const clearNightStepTimer = (record: GameRecord) => {
  if (record.nightStepTimer) {
    clearTimeout(record.nightStepTimer);
    record.nightStepTimer = undefined;
  }
};

const clearDiscussionTimer = (record: GameRecord) => {
  if (record.discussionTimer) {
    clearTimeout(record.discussionTimer);
    record.discussionTimer = undefined;
  }
};

const clearVotingTimer = (record: GameRecord) => {
  if (record.votingTimer) {
    clearTimeout(record.votingTimer);
    record.votingTimer = undefined;
  }
};

const clearAllPhaseTimers = (record: GameRecord) => {
  clearDealTimer(record);
  clearNightCountdownTimer(record);
  clearNightStepTimer(record);
  clearDiscussionTimer(record);
  clearVotingTimer(record);
  clearParallelResultTimer(record);
  clearParallelNightTimer(record);
};

const getTargetKind = (state: GameState, targetId: string): "player" | "center" | "invalid" => {
  if (state.playersById[targetId]) return "player";
  if (targetId.startsWith("center-")) {
    const idx = Number(targetId.replace("center-", ""));
    if (!Number.isNaN(idx) && idx >= 0 && idx <= 2) return "center";
  }
  return "invalid";
};

const removeTokenAssignment = (tokens: TokensState, ownerId: string, targetId: string): Role | null => {
  const ownerTokens = tokens.tokensByPlayer[ownerId];
  const ownerSuspects = tokens.suspectRolesByPlayer[ownerId];
  if (!ownerTokens || !ownerSuspects) return null;
  const role = ownerSuspects[targetId];
  delete ownerTokens[targetId];
  delete ownerSuspects[targetId];
  if (Object.keys(ownerTokens).length === 0) delete tokens.tokensByPlayer[ownerId];
  if (Object.keys(ownerSuspects).length === 0) delete tokens.suspectRolesByPlayer[ownerId];
  return role ?? null;
};

const findRoleAssignment = (
  tokens: TokensState,
  role: Role
): { ownerId: string; targetId: string } | null => {
  const candidates: Array<{ ownerId: string; targetId: string; order: number }> = [];
  for (const [ownerId, suspects] of Object.entries(tokens.suspectRolesByPlayer)) {
    for (const [targetId, assignedRole] of Object.entries(suspects)) {
      if (assignedRole === role) {
        const order = tokens.tokensByPlayer[ownerId]?.[targetId] ?? 0;
        candidates.push({ ownerId, targetId, order });
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.order - b.order);
  return { ownerId: candidates[0].ownerId, targetId: candidates[0].targetId };
};

const buildTokenPool = (roles: Role[]): Record<Role, number> => {
  const pool: Record<Role, number> = {
    villager: 0,
    werewolf: 0,
    minion: 0,
    mason: 0,
    doppleganger: 0,
    seer: 0,
    robber: 0,
    drunk: 0,
    troublemaker: 0,
    insomniac: 0,
    tanner: 0,
  };
  roles.forEach((role) => {
    pool[role] = (pool[role] ?? 0) + 1;
  });
  return pool;
};

const countRoleAssignments = (tokens: TokensState, role: Role): number => {
  let count = 0;
  Object.values(tokens.suspectRolesByPlayer).forEach((suspects) => {
    Object.values(suspects).forEach((assignedRole) => {
      if (assignedRole === role) count += 1;
    });
  });
  return count;
};

const buildNightSteps = (state: GameState): Role[] => {
  if (!state.roles) return [];
  const presentRoles = new Set<Role>([
    ...Object.values(state.roles.originalRolesByPlayer),
    ...state.roles.centerRoles,
  ]);
  return NIGHT_ORDER.filter((role) => presentRoles.has(role));
};

const assignRoles = (state: GameState) => {
  const playerCount = state.playerOrder.length;
  const deck = [...state.roleSelection.roles];
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

const resetTokens = (roles: Role[]): TokensState => ({
  tokensByPlayer: {},
  suspectRolesByPlayer: {},
  tokenPoolByRole: buildTokenPool(roles),
});

const resetVoting = (state: GameState): VotingState => ({
  locked: false,
  votesByPlayer: Object.fromEntries(state.playerOrder.map((id) => [id, null])),
});

const computeVoteTally = (state: GameState): Record<string, number> => {
  const tally: Record<string, number> = {};
  const votes = state.voting?.votesByPlayer ?? {};
  Object.values(votes).forEach((target) => {
    if (!target) return;
    tally[target] = (tally[target] ?? 0) + 1;
  });
  return tally;
};

const emitPendingDopplegangerInsomniacPeeks = (record: GameRecord) => {
  record.dopplegangerInsomniac.forEach((playerId) => {
    const role = getCurrentRole(record.state, playerId);
    if (role) {
      const view: PrivateView = { kind: "insomniacFinalRole", role };
      record.privateViews.set(playerId, view);
      emitPrivate(record, playerId, "NIGHT_ACTION_RESULT", view as unknown as Record<string, unknown>);
      if (record.state.night?.completionByPlayer[playerId] !== undefined) {
        record.state.night.completionByPlayer[playerId] = true;
      }
    }
  });
  record.dopplegangerInsomniac.clear();
};

const computeEliminations = (tally: Record<string, number>): string[] => {
  let topVotes = 0;
  Object.values(tally).forEach((votes) => {
    if (votes > topVotes) topVotes = votes;
  });
  if (topVotes === 0) return [];
  return Object.entries(tally)
    .filter(([, votes]) => votes === topVotes)
    .map(([playerId]) => playerId);
};

const computeWinners = (state: GameState, eliminatedPlayerIds: string[]): RevealState["winners"] => {
  const roles = state.roles?.currentRolesByPlayer ?? {};
  if (eliminatedPlayerIds.some((id) => roles[id] === "tanner")) {
    return "tanner";
  }
  const werewolvesInPlay = Object.values(roles).some((role) => role === "werewolf");
  if (eliminatedPlayerIds.some((id) => roles[id] === "werewolf")) {
    return "village";
  }
  if (!werewolvesInPlay) {
    // ONUW rule: if no werewolf is in play, village only wins when nobody dies.
    return eliminatedPlayerIds.length === 0 ? "village" : "werewolves";
  }
  return "werewolves";
};

const revealVotingResults = (record: GameRecord) => {
  const tally = computeVoteTally(record.state);
  const eliminatedPlayerIds = computeEliminations(tally);
  const winners = computeWinners(record.state, eliminatedPlayerIds);
  record.state.reveal = {
    tally,
    eliminatedPlayerIds,
    winners,
    finalRolesByPlayer: record.state.roles?.currentRolesByPlayer ?? {},
    centerRoles: record.state.roles?.centerRoles ?? ["villager", "villager", "villager"],
  };
  record.state.phase = "reveal";
  record.state.phaseEndsAt = undefined;
  record.state.updatedAt = Date.now();
};

const removePlayerFromState = (record: GameRecord, playerId: string) => {
  const state = record.state;
  delete state.playersById[playerId];
  state.playerOrder = state.playerOrder.filter((id) => id !== playerId);
  if (state.deal?.ackByPlayer) {
    delete state.deal.ackByPlayer[playerId];
  }
  if (state.night?.completionByPlayer) {
    delete state.night.completionByPlayer[playerId];
  }
  if (state.tokens) {
    delete state.tokens.tokensByPlayer[playerId];
    delete state.tokens.suspectRolesByPlayer[playerId];
    Object.values(state.tokens.tokensByPlayer).forEach((targets) => {
      delete targets[playerId];
    });
    Object.values(state.tokens.suspectRolesByPlayer).forEach((suspects) => {
      delete suspects[playerId];
    });
  }
  if (state.voting?.votesByPlayer) {
    delete state.voting.votesByPlayer[playerId];
    Object.keys(state.voting.votesByPlayer).forEach((voterId) => {
      if (state.voting?.votesByPlayer[voterId] === playerId) {
        state.voting.votesByPlayer[voterId] = null;
      }
    });
  }
  record.secrets.delete(playerId);
  record.privateViews.delete(playerId);
  record.pendingParallelViews.delete(playerId);
  const streams = record.privateStreams.get(playerId);
  if (streams) {
    streams.forEach((stream) => {
      try {
        stream.end();
      } catch {
        // ignore
      }
    });
    record.privateStreams.delete(playerId);
  }
};

const NIGHT_COUNTDOWN_MS = 3_000;
const getNightStepMs = (record: GameRecord, stepRole?: Role | null) => {
  const baseMs = Math.max(1, record.state.settings.nightStepSeconds) * 1000;
  if (stepRole === "doppleganger") {
    return Math.ceil(baseMs * 1.5);
  }
  return baseMs;
};
const getParallelResultMs = (record: GameRecord) =>
  Math.max(1, record.state.settings.parallelResultSeconds) * 1000;
const getVotingMs = (record: GameRecord) => Math.max(1, record.state.settings.votingSeconds) * 1000;

const scheduleDiscussionAutoAdvance = (record: GameRecord) => {
  if (!record.state.settings.autoAdvanceNight || record.state.phase !== "discussion") return;
  clearDiscussionTimer(record);
  const delay = Math.max(0, (record.state.phaseEndsAt ?? Date.now()) - Date.now());
  record.discussionTimer = setTimeout(() => {
    if (record.state.phase !== "discussion") return;
    record.state.phase = "voting";
    record.state.voting = resetVoting(record.state);
    record.state.phaseEndsAt = Date.now() + getVotingMs(record);
    record.state.updatedAt = Date.now();
    scheduleVotingAutoReveal(record);
    appendEvent(record, "TIMER_ADVANCE_PHASE", { phase: record.state.phase });
  }, delay);
};

const scheduleVotingAutoReveal = (record: GameRecord) => {
  if (!record.state.settings.autoAdvanceNight || record.state.phase !== "voting") return;
  clearVotingTimer(record);
  const delay = Math.max(0, (record.state.phaseEndsAt ?? Date.now()) - Date.now());
  record.votingTimer = setTimeout(() => {
    if (record.state.phase !== "voting" || !record.state.voting) return;
    revealVotingResults(record);
    appendEvent(record, "TIMER_ADVANCE_PHASE", { phase: record.state.phase });
  }, delay);
};

const queueParallelInfoResults = (record: GameRecord) => {
  const wolves = eligiblePlayersForNightStepRole(record.state, "werewolf");
  wolves.forEach((wolfId) => {
    if (isPlayerAloneWerewolf(record.state, wolfId)) {
      record.pendingParallelViews.set(wolfId, { kind: "werewolfSoloStatus", isSolo: true });
    } else {
      record.pendingParallelViews.set(wolfId, {
        kind: "werewolfSawWerewolves",
        werewolfIds: wolves.filter((id) => id !== wolfId),
      });
    }
  });

  const minions = eligiblePlayersForNightStepRole(record.state, "minion");
  minions.forEach((minionId) => {
    record.pendingParallelViews.set(minionId, { kind: "minionSawWerewolves", werewolfIds: wolves });
  });

  const masons = eligiblePlayersForNightStepRole(record.state, "mason");
  masons.forEach((masonId) => {
    record.pendingParallelViews.set(masonId, {
      kind: "masonSawMasons",
      masonIds: masons.filter((id) => id !== masonId),
    });
  });
};

const startNight = (record: GameRecord) => {
  clearNightStepTimer(record);
  clearParallelNightTimer(record);
  clearParallelResultTimer(record);
  record.pendingParallelViews.clear();
  record.nightSteps = buildNightSteps(record.state);

  const emitInfoForStepRole = (stepRole: Role | null) => {
    if (!stepRole) return;
    if (stepRole === "werewolf") {
      const wolves = eligiblePlayersForNightStepRole(record.state, "werewolf");
      wolves.forEach((wolfId) => {
        if (isPlayerAloneWerewolf(record.state, wolfId)) {
          const view: PrivateView = { kind: "werewolfSoloStatus", isSolo: true };
          record.privateViews.set(wolfId, view);
          emitPrivate(record, wolfId, "WEREWOLF_SOLO_STATUS", { isSolo: true });
        } else {
          const others = wolves.filter((id) => id !== wolfId);
          const view: PrivateView = { kind: "werewolfSawWerewolves", werewolfIds: others };
          record.privateViews.set(wolfId, view);
          emitPrivate(record, wolfId, "WEREWOLF_SAW_WEREWOLVES", { werewolfIds: others });
        }
      });
    }
    if (stepRole === "minion") {
      const wolves = eligiblePlayersForNightStepRole(record.state, "werewolf");
      eligiblePlayersForNightStepRole(record.state, "minion").forEach((minionId) => {
        const view: PrivateView = { kind: "minionSawWerewolves", werewolfIds: wolves };
        record.privateViews.set(minionId, view);
        emitPrivate(record, minionId, "MINION_SAW_WEREWOLVES", { werewolfIds: wolves });
      });
    }
    if (stepRole === "mason") {
      const masons = eligiblePlayersForNightStepRole(record.state, "mason");
      masons.forEach((masonId) => {
        const view: PrivateView = {
          kind: "masonSawMasons",
          masonIds: masons.filter((id) => id !== masonId),
        };
        record.privateViews.set(masonId, view);
        emitPrivate(record, masonId, "MASON_SAW_MASONS", {
          masonIds: masons.filter((id) => id !== masonId),
        });
      });
    }
  };

  if (record.state.settings.parallelNight) {
    const completionByPlayer = Object.fromEntries(
      record.state.playerOrder.map((id) => [id, false])
    );
    record.state.night = {
      stepIndex: 0,
      stepRole: null,
      totalSteps: record.nightSteps.length,
      completionByPlayer,
      copiedRoleByPlayer: Object.fromEntries(record.state.playerOrder.map((id) => [id, null])),
      endsAt: Date.now() + getNightStepMs(record),
      mode: "parallel",
    };
    clearParallelNightTimer(record);
    if (record.state.settings.autoAdvanceNight) {
      record.parallelNightTimer = setTimeout(() => {
        advanceNightStep(record);
        appendEvent(record, "TIMER_ADVANCE_PHASE", { phase: record.state.phase });
      }, getNightStepMs(record));
    }
    // Only send lone-werewolf action hint immediately so they can choose a center card.
    const wolves = eligiblePlayersForNightRole(record.state, "werewolf");
    wolves.forEach((wolfId) => {
      if (!isPlayerAloneWerewolf(record.state, wolfId)) return;
      const view: PrivateView = { kind: "werewolfSoloStatus", isSolo: true };
      record.privateViews.set(wolfId, view);
      emitPrivate(record, wolfId, "WEREWOLF_SOLO_STATUS", { isSolo: true });
    });
  } else {
    const stepRole = record.nightSteps[0] ?? null;
    const completionByPlayer: Record<string, boolean> = {};
    if (stepRole) {
      eligiblePlayersForNightStepRole(record.state, stepRole).forEach((id) => {
        completionByPlayer[id] = false;
      });
    }
    record.state.night = {
      stepIndex: 0,
      stepRole,
      totalSteps: record.nightSteps.length,
      completionByPlayer,
      copiedRoleByPlayer: Object.fromEntries(record.state.playerOrder.map((id) => [id, null])),
      dopplegangerInsomniacStep: false,
      endsAt: Date.now() + getNightStepMs(record, stepRole),
      mode: "sequential",
    };
    if (record.state.settings.autoAdvanceNight) {
      record.nightStepTimer = setTimeout(() => {
        if (record.state.phase !== "night" || record.state.night?.stepIndex !== 0) return;
        advanceNightStep(record);
        appendEvent(record, "TIMER_ADVANCE_PHASE", { phase: record.state.phase });
      }, getNightStepMs(record, stepRole));
    }
    emitInfoForStepRole(stepRole);
  }
  record.state.phase = "night";
  record.state.phaseEndsAt = undefined;
  record.state.updatedAt = Date.now();
};

const advanceNightStep = (record: GameRecord) => {
  if (!record.state.night) return;
  clearNightStepTimer(record);
  if (record.state.night.mode === "parallel") {
    queueParallelInfoResults(record);
    record.pendingParallelViews.forEach((view, playerId) => {
      record.privateViews.set(playerId, view);
      emitPrivate(record, playerId, "NIGHT_ACTION_RESULT", view as unknown as Record<string, unknown>);
    });
    record.pendingParallelViews.clear();
    record.state.phase = "parallelResult";
    record.state.phaseEndsAt = record.state.settings.autoAdvanceNight
      ? Date.now() + getParallelResultMs(record)
      : undefined;
    record.state.night = undefined;
    clearParallelResultTimer(record);
    if (record.state.settings.autoAdvanceNight) {
      record.parallelResultTimer = setTimeout(() => {
        record.state.phase = "discussion";
        record.state.phaseEndsAt = Date.now() + record.state.settings.discussionSeconds * 1000;
        record.state.updatedAt = Date.now();
        scheduleDiscussionAutoAdvance(record);
        appendEvent(record, "TIMER_ADVANCE_PHASE", { phase: record.state.phase });
      }, getParallelResultMs(record));
    }
    record.state.updatedAt = Date.now();
    return;
  }

  const nextIndex = record.state.night.stepIndex + 1;
  const shouldRunDopplegangerInsomniacStep =
    record.state.night.stepRole === "insomniac" &&
    !record.state.night.dopplegangerInsomniacStep &&
    record.dopplegangerInsomniac.size > 0;
  if (shouldRunDopplegangerInsomniacStep) {
    const completionByPlayer = Object.fromEntries(
      [...record.dopplegangerInsomniac].map((playerId) => [playerId, false] as const)
    );
    record.state.night = {
      stepIndex: nextIndex,
      stepRole: "insomniac",
      totalSteps: record.nightSteps.length + 1,
      completionByPlayer,
      copiedRoleByPlayer: record.state.night.copiedRoleByPlayer,
      dopplegangerInsomniacStep: true,
      endsAt: Date.now() + getNightStepMs(record, "insomniac"),
      mode: "sequential",
    };
    emitPendingDopplegangerInsomniacPeeks(record);
    if (record.state.settings.autoAdvanceNight) {
      record.nightStepTimer = setTimeout(() => {
        if (record.state.phase !== "night" || record.state.night?.stepIndex !== nextIndex) return;
        advanceNightStep(record);
        appendEvent(record, "TIMER_ADVANCE_PHASE", { phase: record.state.phase });
      }, getNightStepMs(record, "insomniac"));
    }
    record.state.updatedAt = Date.now();
    return;
  }
  if (nextIndex >= record.nightSteps.length) {
    record.state.phase = "discussion";
    record.state.phaseEndsAt = Date.now() + record.state.settings.discussionSeconds * 1000;
    record.state.night = undefined;
    record.state.updatedAt = Date.now();
    scheduleDiscussionAutoAdvance(record);
    return;
  }

  const stepRole = record.nightSteps[nextIndex];
  const completionByPlayer: Record<string, boolean> = {};
  eligiblePlayersForNightStepRole(record.state, stepRole).forEach((id) => {
    completionByPlayer[id] = false;
  });
  record.state.night = {
    stepIndex: nextIndex,
    stepRole,
    totalSteps: record.nightSteps.length,
    completionByPlayer,
    copiedRoleByPlayer: record.state.night.copiedRoleByPlayer,
    dopplegangerInsomniacStep: false,
    endsAt: Date.now() + getNightStepMs(record, stepRole),
    mode: "sequential",
  };
  if (record.state.settings.autoAdvanceNight) {
    record.nightStepTimer = setTimeout(() => {
      if (record.state.phase !== "night" || record.state.night?.stepIndex !== nextIndex) return;
      advanceNightStep(record);
      appendEvent(record, "TIMER_ADVANCE_PHASE", { phase: record.state.phase });
    }, getNightStepMs(record, stepRole));
  }
  if (stepRole === "werewolf") {
    const wolves = eligiblePlayersForNightStepRole(record.state, "werewolf");
    wolves.forEach((wolfId) => {
      if (isPlayerAloneWerewolf(record.state, wolfId)) {
        const view: PrivateView = { kind: "werewolfSoloStatus", isSolo: true };
        record.privateViews.set(wolfId, view);
        emitPrivate(record, wolfId, "WEREWOLF_SOLO_STATUS", { isSolo: true });
      } else {
        const others = wolves.filter((id) => id !== wolfId);
        const view: PrivateView = { kind: "werewolfSawWerewolves", werewolfIds: others };
        record.privateViews.set(wolfId, view);
        emitPrivate(record, wolfId, "WEREWOLF_SAW_WEREWOLVES", { werewolfIds: others });
      }
    });
  }
  if (stepRole === "minion") {
    const wolves = eligiblePlayersForNightStepRole(record.state, "werewolf");
    eligiblePlayersForNightStepRole(record.state, "minion").forEach((minionId) => {
      const view: PrivateView = { kind: "minionSawWerewolves", werewolfIds: wolves };
      record.privateViews.set(minionId, view);
      emitPrivate(record, minionId, "MINION_SAW_WEREWOLVES", { werewolfIds: wolves });
    });
  }
  if (stepRole === "mason") {
    const masons = eligiblePlayersForNightStepRole(record.state, "mason");
    masons.forEach((masonId) => {
      const view: PrivateView = {
        kind: "masonSawMasons",
        masonIds: masons.filter((id) => id !== masonId),
      };
      record.privateViews.set(masonId, view);
      emitPrivate(record, masonId, "MASON_SAW_MASONS", {
        masonIds: masons.filter((id) => id !== masonId),
      });
    });
  }
  record.state.updatedAt = Date.now();
};

const startNightCountdown = (record: GameRecord) => {
  clearNightCountdownTimer(record);
  record.state.phase = "nightCountdown";
  record.state.phaseEndsAt = Date.now() + NIGHT_COUNTDOWN_MS;
  record.state.updatedAt = Date.now();
  record.nightCountdownTimer = setTimeout(() => {
    if (record.state.phase !== "nightCountdown") return;
    startNight(record);
    appendEvent(record, "TIMER_ADVANCE_PHASE", { phase: record.state.phase });
  }, NIGHT_COUNTDOWN_MS);
};

const validateNightAction = (
  record: GameRecord,
  playerId: string,
  action: NightActionPayload
): string | null => {
  if (!record.state.night || !record.state.roles) return "Night not active";
  if (record.state.night.completionByPlayer[playerId]) return "Already completed";

  const originalRole = getOriginalRole(record.state, playerId);
  if (!originalRole) return "Missing role";
  const copiedRole = originalRole === "doppleganger" ? getDopplegangerCopiedRole(record.state, playerId) : undefined;
  if (action.kind === "dopplegangerCopy" && copiedRole) return "Already copied a role";
  const actingRole =
    action.kind === "dopplegangerCopy"
      ? originalRole
      : originalRole === "doppleganger" && copiedRole
      ? copiedRole
      : originalRole;

  const allowedByRole: Record<string, Role[]> = {
    done: [
      "villager",
      "minion",
      "mason",
      "werewolf",
      "doppleganger",
      "seer",
      "robber",
      "drunk",
      "troublemaker",
      "insomniac",
      "tanner",
    ],
    dopplegangerCopy: ["doppleganger"],
    werewolfSoloPeek: ["werewolf"],
    seerViewPlayer: ["seer"],
    seerViewCenter: ["seer"],
    robberSwap: ["robber"],
    drunkSwap: ["drunk"],
    troublemakerSwap: ["troublemaker"],
    insomniacPeek: ["insomniac"],
  };

  const allowed = allowedByRole[action.kind];
  if (!allowed || !allowed.includes(actingRole)) return "Not allowed for your role";

  if (record.state.night.mode === "sequential") {
    const stepRole = record.state.night.stepRole;
    if (!stepRole) return "Night step missing";
    let eligible = eligiblePlayersForNightStepRole(record.state, stepRole);
    if (stepRole === "insomniac" && record.state.night.dopplegangerInsomniacStep) {
      eligible = Object.keys(record.state.night.completionByPlayer);
    }
    if (!eligible.includes(playerId)) return "Not your night step";
  }

  if (action.kind === "seerViewPlayer" && action.targetPlayerId === playerId) {
    return "Cannot target self";
  }
  if (action.kind === "robberSwap" && action.targetPlayerId === playerId) {
    return "Cannot target self";
  }
  if (action.kind === "troublemakerSwap") {
    const [a, b] = action.targetPlayerIds;
    if (a === b) return "Targets must differ";
    if (a === playerId || b === playerId) return "Cannot target self";
    if (!record.state.playersById[a] || !record.state.playersById[b]) return "Target missing";
  }
  if (action.kind === "seerViewPlayer" && !record.state.playersById[action.targetPlayerId]) {
    return "Target missing";
  }
  if (action.kind === "robberSwap" && !record.state.playersById[action.targetPlayerId]) {
    return "Target missing";
  }
  if (action.kind === "dopplegangerCopy" && !record.state.playersById[action.targetPlayerId]) {
    return "Target missing";
  }
  if (action.kind === "dopplegangerCopy" && action.targetPlayerId === playerId) {
    return "Cannot copy self";
  }
  if (action.kind === "seerViewCenter") {
    const [a, b] = action.centerIndices;
    if (a === b) return "Center indices must differ";
  }

  return null;
};

const handleNightAction = (record: GameRecord, playerId: string, action: NightActionPayload): PrivateView | null => {
  if (!record.state.night || !record.state.roles) return null;
  const mode = record.state.night.mode ?? "sequential";
  const stepRole = mode === "parallel" ? getOriginalRole(record.state, playerId) : record.state.night.stepRole;
  if (!stepRole) return null;
  const originalRole = getOriginalRole(record.state, playerId);
  if (!originalRole) return null;
  const copiedRole = originalRole === "doppleganger" ? getDopplegangerCopiedRole(record.state, playerId) : undefined;
  const actingRole = originalRole === "doppleganger" && copiedRole ? copiedRole : originalRole;

  const markComplete = () => {
    if (record.state.night?.completionByPlayer[playerId] !== undefined) {
      record.state.night.completionByPlayer[playerId] = true;
    }
  };
  const setPlayerView = (view: PrivateView) => {
    if (mode === "parallel") {
      record.pendingParallelViews.set(playerId, view);
      return;
    }
    record.privateViews.set(playerId, view);
  };

  switch (action.kind) {
    case "done":
      markComplete();
      return { kind: "none" };
    case "dopplegangerCopy": {
      const targetRole = getOriginalRole(record.state, action.targetPlayerId);
      if (!targetRole) return null;
      if (action.targetPlayerId === playerId) return null;
      if (record.state.night.copiedRoleByPlayer) {
        record.state.night.copiedRoleByPlayer[playerId] = targetRole;
      }
      record.state.roles.currentRolesByPlayer[playerId] = targetRole;
      if (targetRole === "insomniac") {
        record.dopplegangerInsomniac.add(playerId);
      }
      const copiedRoleNeedsImmediateAction = ["seer", "robber", "troublemaker", "drunk", "minion"].includes(
        targetRole
      );
      if (!copiedRoleNeedsImmediateAction || targetRole === "minion") {
        markComplete();
      }
      {
        const view: PrivateView =
          targetRole === "minion"
            ? {
                kind: "minionSawWerewolves",
                werewolfIds: eligiblePlayersForNightStepRole(record.state, "werewolf"),
                targetPlayerId: action.targetPlayerId,
              }
            : copiedRoleNeedsImmediateAction
            ? { kind: "dopplegangerActAsRole", role: targetRole, targetPlayerId: action.targetPlayerId }
            : { kind: "dopplegangerCopiedRole", role: targetRole, targetPlayerId: action.targetPlayerId };
        setPlayerView(view);
        if (mode === "parallel") {
          // In parallel night, Doppelganger needs immediate feedback about the copied card
          // so they can perform the follow-up action without waiting for result phase.
          record.privateViews.set(playerId, view);
          emitPrivate(record, playerId, "NIGHT_ACTION_RESULT", view as unknown as Record<string, unknown>);
        }
        return view;
      }
    }
    case "werewolfSoloPeek": {
      if (actingRole !== "werewolf") return null;
      if (!isPlayerAloneWerewolf(record.state, playerId)) return null;
      const role = record.state.roles.centerRoles[action.centerIndex];
      markComplete();
      {
        const view: PrivateView = { kind: "werewolfSoloPeek", centerIndex: action.centerIndex, role };
        setPlayerView(view);
        return view;
      }
    }
    case "seerViewPlayer": {
      if (actingRole !== "seer") return null;
      const role = getCurrentRole(record.state, action.targetPlayerId);
      if (!role) return null;
      markComplete();
      {
        const view: PrivateView = { kind: "seerViewPlayer", targetPlayerId: action.targetPlayerId, role };
        setPlayerView(view);
        return view;
      }
    }
    case "seerViewCenter": {
      if (actingRole !== "seer") return null;
      const [a, b] = action.centerIndices;
      if (a === b) return null;
      markComplete();
      {
        const view: PrivateView = {
          kind: "seerViewCenter",
          center: [
            { centerIndex: a, role: record.state.roles.centerRoles[a] },
            { centerIndex: b, role: record.state.roles.centerRoles[b] },
          ],
        };
        setPlayerView(view);
        return view;
      }
    }
    case "robberSwap": {
      if (actingRole !== "robber") return null;
      if (playerId === action.targetPlayerId) return null;
      const newRole = applyRobberSwap(record.state, playerId, action.targetPlayerId);
      if (!newRole) return null;
      markComplete();
      {
        const view: PrivateView = { kind: "robberNewRole", role: newRole };
        setPlayerView(view);
        return view;
      }
    }
    case "drunkSwap": {
      if (actingRole !== "drunk") return null;
      applyDrunkSwap(record.state, playerId, action.centerIndex);
      markComplete();
      {
        const view: PrivateView = { kind: "drunkSwapped", centerIndex: action.centerIndex };
        setPlayerView(view);
        return view;
      }
    }
    case "troublemakerSwap": {
      if (actingRole !== "troublemaker") return null;
      const [a, b] = action.targetPlayerIds;
      if (a === b) return null;
      if (!record.state.playersById[a] || !record.state.playersById[b]) return null;
      applyTroublemakerSwap(record.state, a, b);
      markComplete();
      {
        const view: PrivateView = { kind: "troublemakerSwapped", targetPlayerIds: [a, b] };
        setPlayerView(view);
        return view;
      }
    }
    case "insomniacPeek": {
      if (actingRole !== "insomniac") return null;
      const role = getCurrentRole(record.state, playerId);
      if (!role) return null;
      markComplete();
      {
        const view: PrivateView = { kind: "insomniacFinalRole", role };
        setPlayerView(view);
        return view;
      }
    }
    default:
      return null;
  }
};

const logger = {
  level: FASTIFY_LOG_LEVEL,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: false,
      translateTime: "SYS:standard",
      singleLine: true,
      ignore: "pid,hostname,reqId",
    },
  },
};

const app = fastify({
  logger,
  disableRequestLogging: true,
});
app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
  optionsSuccessStatus: 200,
});

app.post(
  "/games",
  {
    schema: {
      body: {
        type: "object",
        properties: { hostName: { type: "string" } },
      },
    },
  },
  async (request, reply) => {
  const body = request.body as { hostName?: string };
  const hostName = typeof body?.hostName === "string" ? body.hostName.trim() : "Host";
  const roomCode = generateRoomCode();
  const hostId = generateId();
  const secret = generateSecret();

  const state: GameState = {
    roomCode,
    gameName: `Room ${roomCode}`,
    phase: "lobby",
    phaseEndsAt: undefined,
    hostPlayerId: hostId,
    maxPlayers: 12,
    playersById: {
      [hostId]: { playerId: hostId, name: hostName, connected: true, ready: true },
    },
    playerOrder: [hostId],
    settings: { ...DEFAULT_SETTINGS },
    roleSelection: { roles: [] },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

    const record: GameRecord = {
      state,
      version: 0,
      events: [],
      secrets: new Map([[hostId, secret]]),
      streams: new Set(),
      privateStreams: new Map(),
      privateViews: new Map(),
      pendingParallelViews: new Map(),
      nightSteps: [],
      dopplegangerInsomniac: new Set(),
      historyLimit: Number.isFinite(HISTORY_LIMIT) && HISTORY_LIMIT > 0 ? HISTORY_LIMIT : 150,
    };
  games.set(roomCode, record);

  const response: CreateGameResponse = {
    gameId: roomCode,
    host: { playerId: hostId, name: hostName, secret },
    version: record.version,
  };
  return reply.code(201).send(response);
  }
);

app.post(
  "/games/:gameId/join",
  {
    schema: {
      body: {
        type: "object",
        properties: { name: { type: "string" } },
      },
    },
  },
  async (request, reply) => {
  const { gameId } = request.params as { gameId: string };
  const startedAt = Date.now();
  const origin = request.headers.origin ?? null;
  const record = games.get(gameId);
  if (!record) {
    logJoin("rejected", { gameId, reason: "GAME_NOT_FOUND", origin, durationMs: Date.now() - startedAt });
    return reply.code(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });
  }
  if (record.state.phase !== "lobby") {
    logJoin("rejected", {
      gameId,
      reason: "ROOM_IN_PROGRESS",
      phase: record.state.phase,
      origin,
      durationMs: Date.now() - startedAt,
    });
    return reply.code(400).send({ error: "ROOM_IN_PROGRESS", message: "Game already started" });
  }
  if (record.state.playerOrder.length >= record.state.maxPlayers) {
    logJoin("rejected", {
      gameId,
      reason: "ROOM_FULL",
      players: record.state.playerOrder.length,
      maxPlayers: record.state.maxPlayers,
      origin,
      durationMs: Date.now() - startedAt,
    });
    return reply.code(400).send({ error: "ROOM_FULL", message: "Room is full" });
  }

  const body = request.body as { name?: string };
  const name = typeof body?.name === "string" ? body.name.trim() : "Player";

  const playerId = generateId();
  const secret = generateSecret();
  record.secrets.set(playerId, secret);

  record.state.playersById[playerId] = {
    playerId,
    name,
    connected: true,
    ready: false,
  };
  record.state.playerOrder.push(playerId);
  record.state.updatedAt = Date.now();

  const response: JoinGameResponse = { playerId, name, secret, version: record.version };
  appendEvent(record, "PLAYER_JOINED", { playerId, name });
  logGame("join", {
    gameId,
    playerId,
    name,
    players: record.state.playerOrder.length,
    maxPlayers: record.state.maxPlayers,
  });
  logJoin("accepted", {
    gameId,
    playerId,
    name,
    players: record.state.playerOrder.length,
    maxPlayers: record.state.maxPlayers,
    origin,
    durationMs: Date.now() - startedAt,
  });
  return reply.code(201).send(response);
  }
);

app.post(
  "/games/:gameId/commands",
  {
    schema: {
      body: {
        type: "object",
        required: ["playerId", "secret", "lastKnownVersion", "command"],
        properties: {
          playerId: { type: "string" },
          secret: { type: "string" },
          lastKnownVersion: { type: "number" },
          command: {
            type: "object",
            required: ["type"],
            properties: {
              type: { type: "string" },
              payload: { type: "object" },
            },
          },
        },
      },
    },
  },
  async (request, reply) => {
  const { gameId } = request.params as { gameId: string };
  const record = games.get(gameId);
  if (!record) {
    return reply.code(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });
  }

  const body = request.body as CommandEnvelope;
  if (!body?.playerId || !body?.secret || !body?.command) {
    return reply.code(400).send({ error: "INVALID_PAYLOAD", message: "Missing fields" });
  }
  const expected = record.secrets.get(body.playerId);
  if (!expected || expected !== body.secret) {
    return reply.code(401).send({ error: "UNAUTHORIZED", message: "Invalid secret" });
  }
  if (body.lastKnownVersion !== record.version) {
    return reply.code(409).send({
      error: "VERSION_MISMATCH",
      message: "Client is behind server state",
      serverVersion: record.version,
      replayFromVersion: body.lastKnownVersion,
    });
  }

  const commandType = body.command.type;
  const isHost = record.state.hostPlayerId === body.playerId;

  if (commandType === "UPDATE_SETTINGS") {
    if (!isHost || record.state.phase !== "lobby") {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Host only in lobby" });
    }
    const settings = (body.command as any).payload?.settings as Partial<GameSettings>;
    record.state.settings = { ...record.state.settings, ...settings };
    record.state.updatedAt = Date.now();
  }

  if (commandType === "UPDATE_ROLES") {
    if (!isHost || record.state.phase !== "lobby") {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Host only in lobby" });
    }
    const roles = (body.command as any).payload?.roles as Role[] | undefined;
    if (!roles || roles.length === 0) {
      return reply.code(400).send({ error: "INVALID_ROLES", message: "Roles required" });
    }
    record.state.roleSelection = { roles };
    record.state.updatedAt = Date.now();
  }

  if (commandType === "SET_READY") {
    if (record.state.phase !== "lobby") {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Ready only in lobby" });
    }
    const player = record.state.playersById[body.playerId];
    if (player) {
      player.ready = !!(body.command as any).payload?.ready;
      record.state.updatedAt = Date.now();
    }
  }

  if (commandType === "START_GAME") {
    if (!isHost || record.state.phase !== "lobby") {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Host only in lobby" });
    }
    clearAllPhaseTimers(record);
    try {
      assignRoles(record.state);
    } catch {
      return reply.code(400).send({ error: "INVALID_ROLES", message: "Role selection invalid" });
    }
    record.state.phase = "deal";
    record.state.phaseEndsAt = Date.now() + 5_000;
    record.state.deal = {
      ackByPlayer: Object.fromEntries(record.state.playerOrder.map((id) => [id, false])),
    };
    record.state.tokens = resetTokens(record.state.roleSelection.roles);
    record.state.voting = resetVoting(record.state);
    record.state.updatedAt = Date.now();

    record.state.playerOrder.forEach((playerId) => {
      const role = getOriginalRole(record.state, playerId);
      if (role) {
        record.privateViews.set(playerId, { kind: "yourOriginalRole", role });
        emitPrivate(record, playerId, "ROLE_ASSIGNED", { role });
      }
    });
    clearDealTimer(record);
    logGame("start_game", {
      gameId,
      players: record.state.playerOrder.length,
      selectedRoles: record.state.roleSelection.roles.length,
    });
  }

  if (commandType === "ACK_ROLE") {
    if (record.state.phase !== "deal" || !record.state.deal) {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Not in deal" });
    }
    if (!record.state.deal.ackByPlayer[body.playerId]) {
      record.state.deal.ackByPlayer[body.playerId] = true;
      record.state.updatedAt = Date.now();
    }
    if (Object.values(record.state.deal.ackByPlayer).every(Boolean)) {
      record.state.phaseEndsAt = undefined;
    }
  }

  if (commandType === "START_NIGHT") {
    if (!isHost || record.state.phase !== "deal") {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Host only in deal" });
    }
    clearDealTimer(record);
    startNightCountdown(record);
  }

  if (commandType === "ADVANCE_NIGHT_STEP") {
    if (!isHost || (record.state.phase !== "night" && record.state.phase !== "parallelResult")) {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Host only during night" });
    }
    if (record.state.phase === "parallelResult") {
      clearParallelResultTimer(record);
      record.state.phase = "discussion";
      record.state.phaseEndsAt = Date.now() + record.state.settings.discussionSeconds * 1000;
      scheduleDiscussionAutoAdvance(record);
    } else {
      advanceNightStep(record);
    }
    record.state.updatedAt = Date.now();
  }

  if (commandType === "NIGHT_ACTION") {
    if (record.state.phase !== "night") {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Not in night" });
    }
    const error = validateNightAction(record, body.playerId, (body.command as any).payload as NightActionPayload);
    if (error) {
      return reply.code(400).send({ error: "INVALID_ACTION", message: error });
    }
    const payload = (body.command as any).payload as NightActionPayload;
    const view = handleNightAction(record, body.playerId, payload);
    if (view && record.state.night?.mode !== "parallel") {
      record.privateViews.set(body.playerId, view);
      emitPrivate(record, body.playerId, "NIGHT_ACTION_RESULT", view as unknown as Record<string, unknown>);
    }
    record.state.updatedAt = Date.now();
  }

  if (commandType === "PLACE_TOKEN") {
    if (!record.state.tokens || !record.state.settings.tokensEnabled) {
      return reply.code(400).send({ error: "TOKENS_DISABLED", message: "Tokens disabled" });
    }
    if (record.state.phase !== "discussion" && record.state.phase !== "voting") {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Tokens only during discussion/voting" });
    }
    const targetId = (body.command as any).payload?.targetId as string | undefined;
    const role = (body.command as any).payload?.role as Role | undefined;
    if (!targetId || !role) {
      return reply.code(400).send({ error: "INVALID_TOKEN", message: "Target and role required" });
    }
    const targetKind = getTargetKind(record.state, targetId);
    if (targetKind === "invalid") {
      return reply.code(400).send({ error: "INVALID_TARGET", message: "Invalid target" });
    }
    const tokens = record.state.tokens;
    const ownerId = body.playerId;
    const ownerTokens = tokens.tokensByPlayer[ownerId] ?? (tokens.tokensByPlayer[ownerId] = {});
    const ownerSuspects =
      tokens.suspectRolesByPlayer[ownerId] ?? (tokens.suspectRolesByPlayer[ownerId] = {});
    const currentRole = ownerSuspects[targetId];
    if (currentRole === role) {
      removeTokenAssignment(tokens, ownerId, targetId);
      record.state.updatedAt = Date.now();
    } else {
      const capacity = tokens.tokenPoolByRole[role] ?? 0;
      const used = countRoleAssignments(tokens, role);
      if (capacity > 0 && used >= capacity) {
        const existing = findRoleAssignment(tokens, role);
        if (existing) {
          removeTokenAssignment(tokens, existing.ownerId, existing.targetId);
        }
      }
      const order = Date.now();
      ownerTokens[targetId] = order;
      ownerSuspects[targetId] = role;
      record.state.updatedAt = Date.now();
    }
  }

  if (commandType === "REMOVE_TOKEN") {
    if (!record.state.tokens || !record.state.settings.tokensEnabled) {
      return reply.code(400).send({ error: "TOKENS_DISABLED", message: "Tokens disabled" });
    }
    if (record.state.phase !== "discussion" && record.state.phase !== "voting") {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Tokens only during discussion/voting" });
    }
    const targetId = (body.command as any).payload?.targetId as string | undefined;
    if (!targetId) {
      return reply.code(400).send({ error: "INVALID_TOKEN", message: "Target required" });
    }
    removeTokenAssignment(record.state.tokens, body.playerId, targetId);
    record.state.updatedAt = Date.now();
  }

  if (commandType === "CLEAR_TOKENS") {
    if (!record.state.tokens || !record.state.settings.tokensEnabled) {
      return reply.code(400).send({ error: "TOKENS_DISABLED", message: "Tokens disabled" });
    }
    if (record.state.phase !== "discussion" && record.state.phase !== "voting") {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Tokens only during discussion/voting" });
    }
    const tokens = record.state.tokens;
    delete tokens.tokensByPlayer[body.playerId];
    delete tokens.suspectRolesByPlayer[body.playerId];
    record.state.updatedAt = Date.now();
  }

  if (commandType === "START_VOTING") {
    if (!isHost || record.state.phase !== "discussion") {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Host only during discussion" });
    }
    clearDiscussionTimer(record);
    record.state.phase = "voting";
    record.state.voting = resetVoting(record.state);
    record.state.phaseEndsAt = Date.now() + getVotingMs(record);
    record.state.updatedAt = Date.now();
    scheduleVotingAutoReveal(record);
  }

  if (commandType === "LEAVE_GAME") {
    if (isHost) {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Host cannot leave the game" });
    }
    if (!record.state.playersById[body.playerId]) {
      return reply.code(404).send({ error: "PLAYER_NOT_FOUND", message: "Player not found" });
    }
    removePlayerFromState(record, body.playerId);
    record.state.updatedAt = Date.now();
    appendEvent(record, "PLAYER_LEFT", { playerId: body.playerId });
    logGame("leave", { gameId, playerId: body.playerId });
  }

  if (commandType === "KICK_PLAYER") {
    if (!isHost || record.state.phase !== "lobby") {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Host only in lobby" });
    }
    const targetPlayerId = (body.command as any).payload?.playerId as string | undefined;
    if (!targetPlayerId || !record.state.playersById[targetPlayerId]) {
      return reply.code(404).send({ error: "PLAYER_NOT_FOUND", message: "Player not found" });
    }
    if (targetPlayerId === record.state.hostPlayerId) {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Cannot kick host" });
    }
    removePlayerFromState(record, targetPlayerId);
    record.state.updatedAt = Date.now();
    appendEvent(record, "PLAYER_KICKED", { playerId: targetPlayerId });
  }

  if (commandType === "SUBMIT_VOTE") {
    if (record.state.phase !== "voting" || !record.state.voting) {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Not in voting" });
    }
    if (record.state.voting.locked) {
      return reply.code(400).send({ error: "VOTING_LOCKED", message: "Votes locked" });
    }
    const targetPlayerId = (body.command as any).payload?.targetPlayerId as string | undefined;
    if (!targetPlayerId || !record.state.playersById[targetPlayerId]) {
      return reply.code(400).send({ error: "INVALID_TARGET", message: "Invalid target" });
    }
    if (!record.state.settings.allowVoteChanges && record.state.voting.votesByPlayer[body.playerId]) {
      return reply.code(400).send({ error: "VOTE_ALREADY_CAST", message: "Vote already cast" });
    }
    record.state.voting.votesByPlayer[body.playerId] = targetPlayerId;
    record.state.updatedAt = Date.now();
  }

  if (commandType === "LOCK_VOTES") {
    if (!isHost || record.state.phase !== "voting" || !record.state.voting) {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Host only during voting" });
    }
    record.state.voting.locked = !!(body.command as any).payload?.locked;
    record.state.updatedAt = Date.now();
  }

  if (commandType === "REVEAL_RESULTS") {
    if (!isHost || record.state.phase !== "voting" || !record.state.voting) {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Host only during voting" });
    }
    clearVotingTimer(record);
    revealVotingResults(record);
    logGame("end_game", { gameId, winners: record.state.reveal?.winners ?? "unknown" });
  }

  if (commandType === "RESET_GAME") {
    if (!isHost) {
      return reply.code(400).send({ error: "NOT_ALLOWED", message: "Host only" });
    }
    clearAllPhaseTimers(record);
    record.privateViews.clear();
    record.dopplegangerInsomniac.clear();
    record.nightSteps = [];
    record.state.phase = "lobby";
    record.state.phaseEndsAt = undefined;
    record.state.roles = undefined;
    record.state.deal = undefined;
    record.state.night = undefined;
    record.state.voting = undefined;
    record.state.reveal = undefined;
    record.state.tokens = resetTokens(record.state.roleSelection.roles);
    record.pendingParallelViews.clear();
    record.state.playerOrder.forEach((id) => {
      const player = record.state.playersById[id];
      if (player) player.ready = id === record.state.hostPlayerId;
    });
    record.state.updatedAt = Date.now();
    logGame("reset_game", { gameId });
  }

  const event = appendEvent(record, commandType, { playerId: body.playerId, command: body.command });
  const response: CommandResponse = {
    accepted: true,
    appliedVersion: record.version,
    events: [event],
  };
  return reply.code(202).send(response);
  }
);

app.get(
  "/games/:gameId/snapshot",
  {
    schema: {
      querystring: {
        type: "object",
        properties: {
          playerId: { type: "string" },
          secret: { type: "string" },
        },
      },
    },
  },
  async (request, reply) => {
  const { gameId } = request.params as { gameId: string };
  const record = games.get(gameId);
  if (!record) {
    return reply.code(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });
  }
  const { playerId, secret } = request.query as { playerId?: string; secret?: string };
  const response: SnapshotResponse = {
    version: record.version,
    state: buildPublicState(record.state),
  };
  if (playerId && secret) {
    const expected = record.secrets.get(playerId);
    if (expected && expected === secret) {
      const view = record.privateViews.get(playerId);
      if (view) response.private = view;
    }
  }
  return reply.code(200).send(response);
  }
);

app.get(
  "/games/:gameId/events",
  {
    schema: {
      querystring: {
        type: "object",
        properties: { since: { type: "string" } },
      },
    },
  },
  async (request, reply) => {
  const { gameId } = request.params as { gameId: string };
  const record = games.get(gameId);
  if (!record) {
    return reply.code(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });
  }
  const { since } = request.query as { since?: string };
  const sinceVersion = Number(since ?? "0");
  const oldest = record.events.length > 0 ? record.events[0].version : record.version;
  if (sinceVersion < oldest - 1) {
    return reply.code(410).send({ error: "HISTORY_EXPIRED", message: "History expired" });
  }
  const events = record.events.filter(
    (event) => event.version > sinceVersion && !("targetPlayerId" in event.payload)
  );
  const response: EventBatch = {
    fromVersion: sinceVersion,
    toVersion: record.version,
    events,
  };
  return reply.code(200).send(response);
  }
);

app.get(
  "/games/:gameId/stream",
  {
    schema: {
      querystring: {
        type: "object",
        properties: {
          since: { type: "string" },
          playerId: { type: "string" },
          secret: { type: "string" },
        },
      },
    },
  },
  async (request, reply) => {
  const { gameId } = request.params as { gameId: string };
  const record = games.get(gameId);
  if (!record) {
    return reply.code(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });
  }

  const { playerId, secret } = request.query as { playerId?: string; secret?: string };
  if ((playerId && !secret) || (!playerId && secret)) {
    return reply.code(401).send({ error: "UNAUTHORIZED", message: "Missing auth" });
  }
  if (playerId && secret) {
    const expected = record.secrets.get(playerId);
    if (!expected || expected !== secret) {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: "Invalid secret" });
    }
  }
  const since = Number((request.query as { since?: string }).since ?? "0");
  const oldest = record.events.length > 0 ? record.events[0].version : record.version;
  if (since < oldest - 1) {
    return reply.code(410).send({ error: "HISTORY_EXPIRED", message: "History expired" });
  }

  const origin = request.headers.origin ?? "*";
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  });

  record.streams.add(reply.raw);
  let hadExistingPrivateStream = false;
  if (playerId) {
    const existing = record.privateStreams.get(playerId) ?? new Set();
    hadExistingPrivateStream = existing.size > 0;
    existing.add(reply.raw);
    record.privateStreams.set(playerId, existing);
  }
  if (playerId) {
    logGame(hadExistingPrivateStream ? "reconnect" : "connect", { gameId, playerId });
  }

  sendSseSafe(record, reply.raw, "hello", { serverVersion: record.version });
  const backlog = record.events.filter((event) => event.version > since);
  backlog.forEach((event) => {
    const targetPlayerId = (event.payload as { targetPlayerId?: string }).targetPlayerId;
    if (!targetPlayerId) {
      sendSseSafe(record, reply.raw, "public", event);
      return;
    }
    if (playerId && targetPlayerId === playerId) {
      sendSseSafe(record, reply.raw, "private", event);
    }
  });

  const heartbeat = setInterval(() => {
    const ok = sendSseSafe(record, reply.raw, "heartbeat", { serverTime: nowIso() });
    if (!ok) {
      clearInterval(heartbeat);
    }
  }, 15000);

  request.raw.on("close", () => {
    clearInterval(heartbeat);
    record.streams.delete(reply.raw);
    if (playerId) {
      const existing = record.privateStreams.get(playerId);
      if (existing) {
        existing.delete(reply.raw);
        if (existing.size === 0) record.privateStreams.delete(playerId);
      }
    }
    if (playerId) {
      logGame("disconnect", { gameId, playerId });
    }
  });

    reply.hijack();
  }
);

app.setNotFoundHandler((_, reply) => {
  reply.code(404).send({ error: "NOT_FOUND", message: "Route not found" });
});

app.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    app.log.error({ err }, "Failed to start server");
    process.exit(1);
  }
  app.log.info({ port: PORT }, "Fastify REST + SSE listening");
});
