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
    parallelResultSeconds: number;
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
  phase: "deal" | "nightCountdown" | "night" | "parallelResult" | "discussion" | "voting" | "reveal";
  phaseTimer?: string;
  settings?: {
    autoAdvance?: boolean;
    parallelNight?: boolean;
  };
  night: {
    step: string;
    nextStep?: string | null;
    instruction: string;
    remaining: string;
    endsAt?: number | null;
    secondsRemaining?: number | null;
    role?: string;
    actionRole?: string;
    roleInstruction?: string;
    waiting?: boolean;
    doppleFollowupRole?: string;
    selectableCardIds?: string[];
    blinkCardIds?: string[];
    revealedRolesByCardId?: Record<string, string>;
    cardAnnotationsByCardId?: Record<string, string>;
    resultLines?: string[];
  };
  discussion: { timer: string; tokenRoleOptions?: Array<{ label: string; value: string }> };
  voting: { timer: string };
  reveal: {
    eliminated: string;
    winners: string;
    eliminatedPlayerIds?: string[];
    winnerPlayerIds?: string[];
    finalRoleByCardId?: Record<string, string>;
    cardAnnotationsByCardId?: Record<string, string>;
  };
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

const nightOrder = [
  "doppleganger",
  "werewolf",
  "minion",
  "mason",
  "seer",
  "robber",
  "drunk",
  "troublemaker",
  "insomniac",
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

const buildRoleInstruction = (
  roleKey: string,
  privateView: PrivateView | undefined,
  playerNameById: Map<string, string>,
  isParallelNight: boolean
) => {
  const namesFor = (ids: string[]) => ids.map((id) => playerNameById.get(id) ?? id);

  if (roleKey === "werewolf") {
    if (privateView?.kind === "werewolfSoloPeek") {
      return `You peeked Center ${privateView.centerIndex + 1}: ${roleLabels[privateView.role] ?? privateView.role}.`;
    }
    if (privateView?.kind === "werewolfSoloStatus" && privateView.isSolo) {
      return "You are the only werewolf. Tap one highlighted center card before time ends.";
    }
    if (privateView?.kind === "werewolfSawWerewolves") {
      if (!isParallelNight) {
        return "Look for the highlighted werewolf card.";
      }
      const names = namesFor(privateView.werewolfIds);
      if (names.length > 0) {
        return `Other werewolf${names.length > 1 ? "s" : ""}: ${names.join(", ")}.`;
      }
      return "No other werewolves were revealed.";
    }
  }

  if (roleKey === "minion" && privateView?.kind === "minionSawWerewolves") {
    if (!isParallelNight) {
      if ((privateView.werewolfIds?.length ?? 0) === 0) {
        return "No player is a werewolf.";
      }
      return "Werewolves are highlighted. Memorize before discussion.";
    }
    const names = namesFor(privateView.werewolfIds);
    if (names.length > 0) {
      return `Werewolf${names.length > 1 ? "s" : ""}: ${names.join(", ")}. Keep them hidden.`;
    }
    return "No werewolves are in play. Blend in during discussion.";
  }

  if (roleKey === "mason" && privateView?.kind === "masonSawMasons") {
    if ((privateView.masonIds?.length ?? 0) === 0) {
      return "You are the only mason.";
    }
    if (!isParallelNight) {
      return "Look for the highlighted mason card.";
    }
    const names = namesFor(privateView.masonIds);
    return `Other mason${names.length > 1 ? "s" : ""}: ${names.join(", ")}.`;
  }

  if (roleKey === "seer") {
    if (privateView?.kind === "seerViewPlayer") {
      const target = playerNameById.get(privateView.targetPlayerId) ?? privateView.targetPlayerId;
      return `You saw ${target}: ${roleLabels[privateView.role] ?? privateView.role}.`;
    }
    if (privateView?.kind === "seerViewCenter") {
      const [a, b] = privateView.center;
      if (a && b) {
        const aRole = roleLabels[a.role] ?? a.role;
        const bRole = roleLabels[b.role] ?? b.role;
        return `You saw Center ${a.centerIndex + 1}: ${aRole}, Center ${b.centerIndex + 1}: ${bRole}.`;
      }
      return "Vision complete. Memorize what you saw.";
    }
    return "Select one player card or two center cards.";
  }

  if (roleKey === "robber") {
    if (privateView?.kind === "robberNewRole") {
      return `Swap complete. Your new role is ${roleLabels[privateView.role] ?? privateView.role}.`;
    }
    return "Select a player card to swap with.";
  }

  if (roleKey === "troublemaker") {
    if (privateView?.kind === "troublemakerSwapped") {
      const [a, b] = privateView.targetPlayerIds;
      const nameA = playerNameById.get(a) ?? a;
      const nameB = playerNameById.get(b) ?? b;
      return `You swapped ${nameA} and ${nameB}.`;
    }
    return "Select two other player cards to swap.";
  }

  if (roleKey === "drunk") {
    if (privateView?.kind === "drunkSwapped") {
      return `You swapped with Center ${privateView.centerIndex + 1}.`;
    }
    return "Select one center card to swap with.";
  }

  if (roleKey === "insomniac" && privateView?.kind === "insomniacFinalRole") {
    return `Your final role is ${roleLabels[privateView.role] ?? privateView.role}.`;
  }

  if (roleKey === "doppleganger") {
    if (privateView?.kind === "dopplegangerCopiedRole") {
      const copied = roleLabels[privateView.role] ?? privateView.role;
      if (["werewolf", "minion", "mason"].includes(privateView.role)) {
        return `You copied ${copied}. Wait for that role's step.`;
      }
      if (privateView.role === "insomniac") {
        return "You copied Insomniac. You'll see your final role at the end of night.";
      }
      return `You copied ${copied}.`;
    }
    if (privateView?.kind === "dopplegangerActAsRole") {
      const copied = roleLabels[privateView.role] ?? privateView.role;
      return `You copied ${copied}. Perform that action now.`;
    }
  }

  return roleInstructions[roleKey] ?? roleInstructions.villager;
};

const buildResultLines = (
  roleKey: string,
  privateView: PrivateView | undefined,
  playerNameById: Map<string, string>
): string[] => {
  const isParallelForFallback = true;
  const roleLabel = (role?: string) => (role ? roleLabels[role] ?? role : "Unknown");
  const nameFor = (id: string) => playerNameById.get(id) ?? id;

  if (!privateView) return [];

  switch (privateView.kind) {
    case "werewolfSoloPeek":
      return [
        "You were the only werewolf in play.",
        `You peeked Center ${privateView.centerIndex + 1}: ${roleLabel(privateView.role)}.`,
      ];
    case "werewolfSoloStatus":
      return privateView.isSolo ? ["You were the only werewolf in play."] : [];
    case "werewolfSawWerewolves":
      return privateView.werewolfIds.length > 0
        ? [`Other werewolf${privateView.werewolfIds.length > 1 ? "s" : ""}: ${privateView.werewolfIds.map(nameFor).join(", ")}.`]
        : ["No other werewolves were revealed."];
    case "minionSawWerewolves":
      return privateView.werewolfIds.length > 0
        ? [`Werewolf${privateView.werewolfIds.length > 1 ? "s" : ""}: ${privateView.werewolfIds.map(nameFor).join(", ")}.`]
        : ["No werewolves are in play."];
    case "masonSawMasons":
      return privateView.masonIds.length > 0
        ? [`Other mason${privateView.masonIds.length > 1 ? "s" : ""}: ${privateView.masonIds.map(nameFor).join(", ")}.`]
        : ["You are the only mason."];
    case "seerViewPlayer":
      return [`You saw ${nameFor(privateView.targetPlayerId)}: ${roleLabel(privateView.role)}.`];
    case "seerViewCenter":
      return privateView.center.map(
        (item) => `Center ${item.centerIndex + 1}: ${roleLabel(item.role)}.`
      );
    case "robberNewRole":
      return [`Your new role is ${roleLabel(privateView.role)}.`];
    case "drunkSwapped":
      return [`You swapped with Center ${privateView.centerIndex + 1}.`];
    case "troublemakerSwapped":
      return [
        `You swapped ${nameFor(privateView.targetPlayerIds[0])} and ${nameFor(privateView.targetPlayerIds[1])}.`,
      ];
    case "insomniacFinalRole":
      return [`Your final role is ${roleLabel(privateView.role)}.`];
    case "dopplegangerCopiedRole":
      return [`You copied ${roleLabel(privateView.role)}.`];
    case "dopplegangerActAsRole":
      return [`You copied ${roleLabel(privateView.role)} and acted as that role.`];
    default:
      return roleKey ? [buildRoleInstruction(roleKey, privateView, playerNameById, isParallelForFallback)] : [];
  }
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
      return view.role;
    case "dopplegangerActAsRole":
      return view.role;
    case "dopplegangerCopiedRole":
      return "doppleganger";
    case "robberNewRole":
      return "robber";
    case "insomniacFinalRole":
      return "insomniac";
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
    case "troublemakerSwapped":
      return "troublemaker";
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
      nightStepSeconds: state.settings.nightStepSeconds,
      parallelResultSeconds: state.settings.parallelResultSeconds,
      discussionSeconds: state.settings.discussionSeconds,
      votingSeconds: state.settings.votingSeconds,
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

  const phaseMap: Record<
    string,
    "deal" | "nightCountdown" | "night" | "parallelResult" | "discussion" | "voting" | "reveal"
  > = {
    deal: "deal",
    night: "night",
    nightCountdown: "nightCountdown",
    parallelResult: "parallelResult",
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
  const isDopplegangerInsomniacStep = !!state.night?.dopplegangerInsomniacStep;
  const stepLabel =
    mappedPhase === "parallelResult"
      ? roleLabels[roleKey] ?? "Night"
      : isDopplegangerInsomniacStep
      ? "Doppleganger Insomniac"
      : roleLabels[stepRole] ?? "Night";
  const nextStepLabel = nextStepRole
    ? roleLabels[nextStepRole] ?? null
    : isDopplegangerInsomniacStep
    ? "Discussion"
    : null;
  const playerNameById = new Map(state.players.map((item) => [item.playerId, item.name]));
  const isParallelNight = state.night?.mode === "parallel";
  const roleInstruction = buildRoleInstruction(roleKey, privateView, playerNameById, isParallelNight);
  const playerCopiedRole = playerId ? state.night?.copiedRoleByPlayer?.[playerId] ?? null : null;
  const isDopplegangerStepWithCopiedRole = stepRole === "doppleganger" && playerCopiedRole !== null;
  const roleDisplayKey =
    isDopplegangerStepWithCopiedRole ||
    privateView?.kind === "dopplegangerActAsRole" ||
    privateView?.kind === "dopplegangerCopiedRole" ||
    (privateView?.kind === "minionSawWerewolves" && !!privateView.targetPlayerId)
      ? "doppleganger"
      : roleKey;
  const doppleFollowupRole =
    stepRole === "doppleganger"
      ? privateView?.kind === "dopplegangerActAsRole"
        ? roleLabels[privateView.role] ?? privateView.role
        : privateView?.kind === "minionSawWerewolves" && privateView.targetPlayerId
        ? roleLabels.minion
        : undefined
      : undefined;
  const dopplegangerActingNow =
    stepRole === "doppleganger" &&
    (privateView?.kind === "dopplegangerActAsRole" || privateView?.kind === "minionSawWerewolves");
  const copiedRoleByPlayer = state.night?.copiedRoleByPlayer ?? {};
  const copiedRoleForPlayer = playerId ? copiedRoleByPlayer[playerId] ?? null : null;
  const hasPendingDopplegangerInsomniac =
    stepRole === "insomniac" &&
    !isDopplegangerInsomniacStep &&
    Object.values(copiedRoleByPlayer).some((role) => role === "insomniac");
  const computedNextStepLabel = hasPendingDopplegangerInsomniac ? "Doppleganger Insomniac" : nextStepLabel;
  const copiedRoleForCard = (cardId: string) => copiedRoleByPlayer[cardId] ?? null;
  const isCopiedDopplegangerCard = (cardId: string) => !cardId.startsWith("center-") && copiedRoleForCard(cardId) !== null;
  const dopplegangerAnnotationForCard = (cardId: string) => {
    const copiedRole = copiedRoleForCard(cardId);
    if (!copiedRole) return undefined;
    return `Doppleganger ${roleLabels[copiedRole] ?? copiedRole}`;
  };
  const dopplegangerImmediateRoles = new Set(["seer", "robber", "troublemaker", "drunk", "minion"]);
  const isDopplegangerImmediateWindow =
    stepRole === "doppleganger" && copiedRoleForPlayer !== null && dopplegangerImmediateRoles.has(copiedRoleForPlayer);
  const selectedRoleSet = new Set(state.roleSelection);
  const orderedSelectedRoles = [
    ...nightOrder.filter((role) => selectedRoleSet.has(role)),
    ...roleOrder.filter((role) => !nightOrder.includes(role) && selectedRoleSet.has(role)),
  ];
  const nightIndexByRole = new Map(
    orderedSelectedRoles
      .filter((role) => nightOrder.includes(role))
      .map((role, index) => [role, index + 1])
  );
  const discussionTokenRoleOptions = orderedSelectedRoles.map((role) => {
    const label = roleLabels[role] ?? role;
    const order = nightIndexByRole.get(role);
    return {
      label: order ? `${order}. ${label}` : label,
      value: label,
    };
  });
  const nightWaiting =
    state.night?.mode === "parallel"
      ? false
      : (mappedPhase === "night" || mappedPhase === "parallelResult") &&
        stepRole !== roleKey &&
        !dopplegangerActingNow &&
        !isDopplegangerImmediateWindow;
  const revealedRolesByCardId: Record<string, string> = {};
  const cardAnnotationsByCardId: Record<string, string> = {};
  const blinkCardIds = new Set<string>();
  const selectableCardIds: string[] = [];
  const setRevealedRole = (cardId: string, role: string) => {
    if (isCopiedDopplegangerCard(cardId)) {
      revealedRolesByCardId[cardId] = "doppleganger";
      const annotation = dopplegangerAnnotationForCard(cardId);
      if (annotation) {
        cardAnnotationsByCardId[cardId] = annotation;
      }
      return;
    }
    revealedRolesByCardId[cardId] = role;
  };
  const inNightPhase = mappedPhase === "night" || mappedPhase === "parallelResult";
  const canShowActionReveal = (actionRole: string) =>
    inNightPhase &&
    (isParallelNight || stepRole === actionRole || (stepRole === "doppleganger" && copiedRoleForPlayer === actionRole));

  if (privateView?.kind === "werewolfSoloPeek" && canShowActionReveal("werewolf")) {
    setRevealedRole(`center-${privateView.centerIndex}`, privateView.role);
    if (isParallelNight) {
      cardAnnotationsByCardId[`center-${privateView.centerIndex}`] = "You peeked this center card";
    }
  }
  if (privateView?.kind === "seerViewPlayer" && canShowActionReveal("seer")) {
    setRevealedRole(privateView.targetPlayerId, privateView.role);
    if (isParallelNight) {
      cardAnnotationsByCardId[privateView.targetPlayerId] = "Seen by you";
    }
  }
  if (
    (privateView?.kind === "dopplegangerCopiedRole" || privateView?.kind === "dopplegangerActAsRole") &&
    canShowActionReveal("doppleganger")
  ) {
    setRevealedRole(privateView.targetPlayerId, privateView.role);
  }
  if (
    privateView?.kind === "minionSawWerewolves" &&
    privateView.targetPlayerId &&
    canShowActionReveal("doppleganger")
  ) {
    setRevealedRole(privateView.targetPlayerId, "minion");
  }
  if (privateView?.kind === "seerViewCenter" && canShowActionReveal("seer")) {
    privateView.center.forEach((item) => {
      setRevealedRole(`center-${item.centerIndex}`, item.role);
      if (isParallelNight) {
        cardAnnotationsByCardId[`center-${item.centerIndex}`] = "Seen by you";
      }
    });
  }
  if (privateView?.kind === "robberNewRole" && playerId && canShowActionReveal("robber")) {
    setRevealedRole(playerId, privateView.role);
    if (isParallelNight) {
      cardAnnotationsByCardId[playerId] = "Your new role";
    }
  }
  if (privateView?.kind === "drunkSwapped" && canShowActionReveal("drunk")) {
    if (isParallelNight) {
      cardAnnotationsByCardId[`center-${privateView.centerIndex}`] = "You swapped with this center card";
    }
  }
  if (privateView?.kind === "troublemakerSwapped" && canShowActionReveal("troublemaker")) {
    const [a, b] = privateView.targetPlayerIds;
    if (isParallelNight) {
      cardAnnotationsByCardId[a] = "Swapped by you";
      cardAnnotationsByCardId[b] = "Swapped by you";
    }
  }
  if (privateView?.kind === "insomniacFinalRole" && playerId && canShowActionReveal("insomniac")) {
    setRevealedRole(playerId, privateView.role);
    if (isParallelNight) {
      cardAnnotationsByCardId[playerId] = "Final role";
    }
  }
  if (privateView?.kind === "werewolfSawWerewolves") {
    privateView.werewolfIds.filter((id) => id !== playerId).forEach((id) => {
      blinkCardIds.add(id);
      if (canShowActionReveal("werewolf")) {
        if (copiedRoleByPlayer[id] === "werewolf") {
          revealedRolesByCardId[id] = "doppleganger";
          cardAnnotationsByCardId[id] = "Doppleganger werewolf";
        } else {
          revealedRolesByCardId[id] = "werewolf";
        }
      }
    });
  }
  if (privateView?.kind === "minionSawWerewolves") {
    privateView.werewolfIds.forEach((id) => {
      blinkCardIds.add(id);
      if (canShowActionReveal("minion")) {
        if (copiedRoleByPlayer[id] === "werewolf") {
          revealedRolesByCardId[id] = "doppleganger";
          cardAnnotationsByCardId[id] = "Doppleganger werewolf";
        } else {
          revealedRolesByCardId[id] = "werewolf";
        }
      }
    });
  }
  if (privateView?.kind === "masonSawMasons") {
    privateView.masonIds.filter((id) => id !== playerId).forEach((id) => {
      blinkCardIds.add(id);
      if (canShowActionReveal("mason")) {
        setRevealedRole(id, "mason");
      }
    });
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
          name: roleLabels[roleDisplayKey] ?? "Villager",
          description: roleDescriptions[roleDisplayKey] ?? roleDescriptions.villager,
        },
        playerName,
        playerId,
        cards,
      },
      phase: mappedPhase,
      phaseTimer: phaseSecondsRemaining !== null ? formatSeconds(phaseSecondsRemaining) : undefined,
      settings: {
        autoAdvance: state.settings.autoAdvanceNight,
        parallelNight: state.settings.parallelNight,
      },
      night: {
        step: stepLabel,
        nextStep: computedNextStepLabel,
        instruction: roleInstructions[stepRole] ?? roleInstructions.villager,
        remaining:
          nightSecondsRemaining !== null
            ? `Time left: ${formatSeconds(nightSecondsRemaining)}`
            : `${completed} of ${total} players complete`,
        endsAt: state.night?.endsAt ?? null,
        secondsRemaining: nightSecondsRemaining,
        role: roleLabels[roleDisplayKey],
        actionRole: roleLabels[roleKey],
        roleInstruction,
        waiting: nightWaiting,
        doppleFollowupRole,
        selectableCardIds,
        blinkCardIds: [...blinkCardIds],
        revealedRolesByCardId,
        cardAnnotationsByCardId,
        resultLines: buildResultLines(roleKey, privateView, playerNameById),
      },
      discussion: {
        timer: phaseSecondsRemaining !== null ? formatSeconds(phaseSecondsRemaining) : "00:00",
        tokenRoleOptions: discussionTokenRoleOptions,
      },
      voting: {
        timer: phaseSecondsRemaining !== null ? formatSeconds(phaseSecondsRemaining) : "00:00",
      },
      reveal: {
        eliminated:
          state.reveal?.eliminatedPlayerIds?.length && state.reveal.eliminatedPlayerIds.length > 0
            ? state.reveal.eliminatedPlayerIds.map((id) => playerNameById.get(id) ?? id).join(", ")
            : "None",
        winners: state.reveal?.winners ?? "Unknown",
        eliminatedPlayerIds: state.reveal?.eliminatedPlayerIds ?? [],
        winnerPlayerIds: (() => {
          const finalRoles = state.reveal?.finalRoles ?? {};
          const eliminatedIds = state.reveal?.eliminatedPlayerIds ?? [];
          const winners = state.reveal?.winners;
          if (winners === "tanner") {
            return eliminatedIds.filter((id) => finalRoles[id] === "tanner");
          }
          if (winners === "village") {
            return state.players
              .map((item) => item.playerId)
              .filter((id) => finalRoles[id] !== "werewolf" && finalRoles[id] !== "tanner");
          }
          if (winners === "werewolves") {
            return state.players
              .map((item) => item.playerId)
              .filter((id) => finalRoles[id] === "werewolf" || finalRoles[id] === "minion");
          }
          return [];
        })(),
        finalRoleByCardId: (() => {
          const byCard: Record<string, string> = {};
          const finalRoles = state.reveal?.finalRoles ?? {};
          const originalRoles = state.reveal?.originalRoles ?? {};
          Object.entries(finalRoles).forEach(([id, role]) => {
            byCard[id] = originalRoles[id] === "doppleganger" ? "doppleganger" : role;
          });
          (state.reveal?.centerRoles ?? []).forEach((role, index) => {
            byCard[`center-${index}`] = role;
          });
          return byCard;
        })(),
        cardAnnotationsByCardId: (() => {
          const byCard: Record<string, string> = {};
          const finalRoles = state.reveal?.finalRoles ?? {};
          const originalRoles = state.reveal?.originalRoles ?? {};
          Object.entries(finalRoles).forEach(([id, role]) => {
            if (originalRoles[id] === "doppleganger") {
              byCard[id] = `Doppleganger ${roleLabels[role] ?? role}`;
            }
          });
          return byCard;
        })(),
      },
    },
    discussionTokensByCard: buildTokensByCard(state),
    voteCountsByCard: buildVoteCountsByCard(state),
  };
};
