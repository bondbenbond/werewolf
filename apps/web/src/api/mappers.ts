import type { PublicGameState, PrivateView } from "./useLiveGame";

type LobbyData = {
  roomCode: string;
  gameName?: string;
  shareUrl: string;
  players: Array<{ name: string; connected: boolean; ready: boolean; host?: boolean }>;
  roles: Array<{ name: string; count: number }>;
  settings: {
    autoAdvance: boolean;
    parallelNight: boolean;
    nightStepSeconds: number;
    discussionSeconds: number;
    votingSeconds: number;
  };
  startCountdownSeconds?: number | null;
  showCountdownOverlay?: boolean;
};

type GameBoardData = {
  title: string;
  phase: string;
  phaseSecondsRemaining?: number | null;
  phaseSecondsTotal?: number | null;
  phaseEndsAt?: number | null;
  role: { name: string; description: string };
  playerName: string;
  playerId?: string;
  cards: Array<{ id: string; label: string; type: "center" | "player" }>;
};

type GameScreenData = {
  board: GameBoardData;
  phase: "deal" | "nightCountdown" | "night" | "discussion" | "voting" | "reveal";
  phaseTimer?: string;
  night: {
    step: string;
    nextStep?: string | null;
    instruction: string;
    remaining: string;
    secondsRemaining?: number | null;
    role?: string;
    roleInstruction?: string;
    waiting?: boolean;
    selectableCardIds?: string[];
    blinkCardIds?: string[];
    revealedRolesByCardId?: Record<string, string>;
    cardAnnotationsByCardId?: Record<string, string>;
  };
  discussion: { timer: string };
  voting: { timer: string };
  reveal: { eliminated: string; winners: string };
};

export type MappedGame = {
  data: GameScreenData;
  discussionTokensByCard: Record<string, string | null>;
  voteCountsByCard: Record<string, number>;
};

const roleOrder = [
  "werewolf",
  "minion",
  "mason",
  "seer",
  "robber",
  "troublemaker",
  "drunk",
  "insomniac",
  "doppleganger",
  "tanner",
  "villager",
];

const roleLabels: Record<string, string> = {
  werewolf: "Werewolf",
  minion: "Minion",
  mason: "Mason",
  seer: "Seer",
  robber: "Robber",
  troublemaker: "Troublemaker",
  drunk: "Drunk",
  insomniac: "Insomniac",
  doppleganger: "Doppleganger",
  tanner: "Tanner",
  villager: "Villager",
};

const roleDescriptions: Record<string, string> = {
  werewolf: "Find the other werewolf or peek a center card if alone.",
  minion: "See the werewolves and help them win.",
  mason: "Find the other mason.",
  seer: "View one player card or two center cards.",
  robber: "Swap with another player and view your new role.",
  troublemaker: "Swap two other players' cards.",
  drunk: "Swap with a random center card without looking.",
  insomniac: "Peek your card at the end of night.",
  doppleganger: "Copy another role and act as them.",
  tanner: "You win if you are eliminated.",
  villager: "No night action. Blend in and deduce.",
};

const roleInstructions: Record<string, string> = {
  werewolf: "Look for other werewolves. If alone, you may peek one center card.",
  minion: "See the werewolves, then close your eyes.",
  mason: "Look for the other mason.",
  seer: "View one player or two center cards.",
  robber: "Swap with a player and view your new role.",
  troublemaker: "Swap two other players.",
  drunk: "Swap with a center card without looking.",
  insomniac: "Peek your card at the end of night.",
  doppleganger: "Copy another role, then perform that action.",
  tanner: "Try to get yourself eliminated.",
  villager: "No action. Keep eyes closed.",
};

const formatSeconds = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const remainingSeconds = (endsAt?: number) => {
  if (!endsAt) return null;
  const diff = Math.ceil((endsAt - Date.now()) / 1000);
  return diff > 0 ? diff : 0;
};

const roleFromPrivateView = (view?: PrivateView) => {
  if (!view) return null;
  switch (view.kind) {
    case "yourOriginalRole":
    case "dopplegangerCopiedRole":
    case "robberNewRole":
    case "insomniacFinalRole":
      return view.role;
    case "seerViewPlayer":
    case "seerViewCenter":
      return "seer";
    case "minionSawWerewolves":
      return "minion";
    case "masonSawMasons":
      return "mason";
    case "werewolfSawWerewolves":
    case "werewolfSoloPeek":
    case "werewolfSoloStatus":
      return "werewolf";
    case "drunkSwapped":
      return "drunk";
    default:
      return null;
  }
};

const buildTokensByCard = (state: PublicGameState) => {
  const tokens = state.tokens;
  if (!tokens) return {};
  const result: Record<string, string | null> = {};
  const orderByTarget: Record<string, number> = {};
  Object.entries(tokens.suspectRolesByPlayer).forEach(([ownerId, suspects]) => {
    Object.entries(suspects).forEach(([targetId, role]) => {
      const order = tokens.tokensByPlayer[ownerId]?.[targetId] ?? 0;
      const currentOrder = orderByTarget[targetId] ?? -1;
      if (order >= currentOrder) {
        result[targetId] = role;
        orderByTarget[targetId] = order;
      }
    });
  });
  return result;
};

const buildVoteCountsByCard = (state: PublicGameState) => {
  const tally = state.voting?.tally ?? {};
  return { ...tally };
};

export const mapLobbyData = (state: PublicGameState, gameId: string): LobbyData => {
  const roles = roleOrder.map((role) => ({
    name: roleLabels[role],
    count: state.roleSelection.filter((item) => item === role).length,
  }));
  return {
    roomCode: gameId,
    gameName: state.gameName,
    shareUrl: `${window.location.origin}/?game=${gameId}`,
    players: state.players.map((player) => ({
      playerId: player.playerId,
      name: player.name,
      connected: player.connected,
      ready: player.ready,
      host: player.playerId === state.hostPlayerId,
    })),
    roles,
    settings: {
      autoAdvance: state.settings.autoAdvanceNight,
      parallelNight: state.settings.parallelNight,
      nightStepSeconds: 10,
      discussionSeconds: state.settings.discussionSeconds,
      votingSeconds: 10,
    },
    startCountdownSeconds: null,
  };
};

export const mapGameData = (
  state: PublicGameState,
  privateView: PrivateView | undefined,
  playerId?: string
): MappedGame => {
  const roleKey = roleFromPrivateView(privateView) ?? "villager";
  const player = state.players.find((item) => item.playerId === playerId) ?? state.players[0];
  const playerName = player?.name ?? "Player";
  const cards = [
    { id: "center-0", label: "Center 1", type: "center" as const },
    { id: "center-1", label: "Center 2", type: "center" as const },
    { id: "center-2", label: "Center 3", type: "center" as const },
    ...state.players.map((item) => ({
      id: item.playerId,
      label: item.name,
      type: "player" as const,
    })),
  ];

  const phaseMap: Record<string, "deal" | "nightCountdown" | "night" | "discussion" | "voting" | "reveal"> = {
    deal: "deal",
    night: "night",
    nightCountdown: "nightCountdown",
    parallelResult: "night",
    discussion: "discussion",
    voting: "voting",
    reveal: "reveal",
  };
  const mappedPhase = phaseMap[state.phase] ?? "deal";
  const phaseSecondsRemaining = remainingSeconds(state.phaseEndsAt);
  const nightSecondsRemaining = remainingSeconds(state.night?.endsAt ?? undefined);
  const completed = state.night
    ? Object.values(state.night.completedThisStep).filter(Boolean).length
    : 0;
  const total = state.night ? Object.keys(state.night.completedThisStep).length : 0;
  const stepRole = state.night?.stepRole ?? "night";
  const nextStepRole = state.night?.nextStepRole ?? null;
  const stepLabel = roleLabels[stepRole] ?? "Night";
  const nextStepLabel = nextStepRole ? roleLabels[nextStepRole] ?? null : null;
  const roleInstruction = roleInstructions[roleKey] ?? roleInstructions.villager;
  const nightWaiting =
    state.night?.mode === "parallel"
      ? false
      : mappedPhase === "night" && stepRole !== roleKey;
  const revealedRolesByCardId: Record<string, string> = {};
  const cardAnnotationsByCardId: Record<string, string> = {};
  const blinkCardIds = new Set<string>();
  const selectableCardIds: string[] = [];

  if (privateView?.kind === "werewolfSoloPeek") {
    revealedRolesByCardId[`center-${privateView.centerIndex}`] = privateView.role;
  }
  if (privateView?.kind === "seerViewPlayer") {
    revealedRolesByCardId[privateView.targetPlayerId] = privateView.role;
  }
  if (privateView?.kind === "seerViewCenter") {
    privateView.center.forEach((item) => {
      revealedRolesByCardId[`center-${item.centerIndex}`] = item.role;
    });
  }
  if (privateView?.kind === "robberNewRole" && playerId) {
    revealedRolesByCardId[playerId] = privateView.role;
    cardAnnotationsByCardId[playerId] = "Your new role";
  }
  if (privateView?.kind === "insomniacFinalRole" && playerId) {
    revealedRolesByCardId[playerId] = privateView.role;
    cardAnnotationsByCardId[playerId] = "Final role";
  }
  if (privateView?.kind === "werewolfSawWerewolves") {
    privateView.werewolfIds.filter((id) => id !== playerId).forEach((id) => blinkCardIds.add(id));
  }
  if (privateView?.kind === "minionSawWerewolves") {
    privateView.werewolfIds.forEach((id) => blinkCardIds.add(id));
  }
  if (privateView?.kind === "masonSawMasons") {
    privateView.masonIds.filter((id) => id !== playerId).forEach((id) => blinkCardIds.add(id));
  }
  if (privateView?.kind === "werewolfSoloStatus" && privateView.isSolo) {
    selectableCardIds.push("center-0", "center-1", "center-2");
  }

  return {
    data: {
      board: {
        title: "Game Board",
        phase: mappedPhase.charAt(0).toUpperCase() + mappedPhase.slice(1),
        phaseSecondsRemaining: phaseSecondsRemaining ?? undefined,
        phaseSecondsTotal: undefined,
        phaseEndsAt: state.phaseEndsAt,
        role: {
          name: roleLabels[roleKey] ?? "Villager",
          description: roleDescriptions[roleKey] ?? roleDescriptions.villager,
        },
        playerName,
        playerId,
        cards,
      },
      phase: mappedPhase,
      phaseTimer: phaseSecondsRemaining !== null ? formatSeconds(phaseSecondsRemaining) : undefined,
      night: {
        step: stepLabel,
        nextStep: nextStepLabel,
        instruction: roleInstructions[stepRole] ?? roleInstructions.villager,
        remaining:
          nightSecondsRemaining !== null
            ? `Time left: ${formatSeconds(nightSecondsRemaining)}`
            : `${completed} of ${total} players complete`,
        secondsRemaining: nightSecondsRemaining,
        role: roleLabels[roleKey],
        roleInstruction,
        waiting: nightWaiting,
        selectableCardIds,
        blinkCardIds: [...blinkCardIds],
        revealedRolesByCardId,
        cardAnnotationsByCardId,
      },
      discussion: {
        timer: phaseSecondsRemaining !== null ? formatSeconds(phaseSecondsRemaining) : "00:00",
      },
      voting: {
        timer: phaseSecondsRemaining !== null ? formatSeconds(phaseSecondsRemaining) : "00:00",
      },
      reveal: {
        eliminated: state.reveal?.eliminatedPlayerIds?.join(", ") ?? "None",
        winners: state.reveal?.winners ?? "Unknown",
      },
    },
    discussionTokensByCard: buildTokensByCard(state),
    voteCountsByCard: buildVoteCountsByCard(state),
  };
};
