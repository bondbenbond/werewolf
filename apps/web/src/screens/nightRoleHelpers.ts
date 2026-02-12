type BoardCard = {
  id: string;
  type: "center" | "player";
};

export type NightSelections = {
  players: string[];
  centers: number[];
};

export const ROLE_KEYS_REQUIRING_SELECTION = ["doppleganger", "seer", "robber", "troublemaker", "drunk"] as const;
export const ROLE_KEYS_REQUIRING_START_MODAL = ["werewolf", "insomniac", "minion", "mason"] as const;
export const ROLE_KEYS_REQUIRING_START_TO_REVEAL = ["werewolf", "mason", "minion"] as const;

type ComputeSelectableArgs = {
  phase: string;
  nightWaiting?: boolean;
  nightActionState: "idle" | "selecting" | "confirmed";
  nightActionPending: boolean;
  roleKey: string;
  cards: BoardCard[];
  playerId?: string;
  selectedCenters: number[];
  selectedPlayers: string[];
  werewolfSelectableCardIds?: string[];
};

export const computeNightSelectable = ({
  phase,
  nightWaiting,
  nightActionState,
  nightActionPending,
  roleKey,
  cards,
  playerId,
  selectedCenters,
  selectedPlayers,
  werewolfSelectableCardIds,
}: ComputeSelectableArgs): string[] => {
  if (phase !== "night" || nightWaiting || nightActionState !== "selecting" || nightActionPending) {
    return [];
  }

  if (roleKey === "seer") {
    if (selectedCenters.length > 0) {
      return cards
        .filter((card) => card.type === "center")
        .map((card) => card.id)
        .filter((cardId) => !selectedCenters.includes(Number(cardId.replace("center-", ""))));
    }
    return cards
      .filter((card) => card.type === "center" || (card.type === "player" && card.id !== playerId))
      .map((card) => card.id);
  }

  if (roleKey === "robber") {
    return cards
      .filter((card) => card.type === "player" && card.id !== playerId)
      .map((card) => card.id);
  }

  if (roleKey === "troublemaker") {
    return cards
      .filter((card) => card.type === "player" && card.id !== playerId && !selectedPlayers.includes(card.id))
      .map((card) => card.id);
  }

  if (roleKey === "drunk") {
    return cards.filter((card) => card.type === "center").map((card) => card.id);
  }

  if (roleKey === "werewolf") {
    return werewolfSelectableCardIds ?? [];
  }

  if (roleKey === "doppleganger") {
    return cards
      .filter((card) => card.type === "player" && card.id !== playerId)
      .map((card) => card.id);
  }

  return [];
};

type ResolveNightActionArgs = {
  roleKey: string;
  card: BoardCard;
  cardId: string;
  playerId?: string;
  selections: NightSelections;
};

type ResolvedNightAction =
  | { type: "noop" }
  | { type: "select"; nextSelections: NightSelections }
  | {
      type: "submit";
      payload: Record<string, unknown>;
      nextSelections?: NightSelections;
      markConfirmed: boolean;
    };

export const resolveNightCardAction = ({
  roleKey,
  card,
  cardId,
  playerId,
  selections,
}: ResolveNightActionArgs): ResolvedNightAction => {
  if (roleKey === "doppleganger" && card.type === "player") {
    return {
      type: "submit",
      payload: { kind: "dopplegangerCopy", targetPlayerId: cardId },
      nextSelections: { players: [cardId], centers: [] },
      markConfirmed: true,
    };
  }

  if (roleKey === "werewolf" && card.type === "center") {
    const centerIndex = Number(cardId.replace("center-", ""));
    if (Number.isNaN(centerIndex)) return { type: "noop" };
    return {
      type: "submit",
      payload: { kind: "werewolfSoloPeek", centerIndex },
      markConfirmed: true,
    };
  }

  if (roleKey === "seer") {
    if (card.type === "player") {
      if (cardId === playerId) return { type: "noop" };
      return {
        type: "submit",
        payload: { kind: "seerViewPlayer", targetPlayerId: cardId },
        nextSelections: { players: [cardId], centers: [] },
        markConfirmed: true,
      };
    }
    if (card.type === "center") {
      const centerIndex = Number(cardId.replace("center-", ""));
      if (Number.isNaN(centerIndex)) return { type: "noop" };
      const nextCenters = [...selections.centers, centerIndex].slice(0, 2);
      if (nextCenters.length >= 2) {
        return {
          type: "submit",
          payload: { kind: "seerViewCenter", centerIndices: [nextCenters[0], nextCenters[1]] },
          nextSelections: { players: [], centers: nextCenters },
          markConfirmed: true,
        };
      }
      return {
        type: "select",
        nextSelections: { players: [], centers: nextCenters },
      };
    }
  }

  if (roleKey === "robber" && card.type === "player") {
    return {
      type: "submit",
      payload: { kind: "robberSwap", targetPlayerId: cardId },
      nextSelections: { players: [cardId], centers: [] },
      markConfirmed: true,
    };
  }

  if (roleKey === "drunk" && card.type === "center") {
    const centerIndex = Number(cardId.replace("center-", ""));
    if (Number.isNaN(centerIndex)) return { type: "noop" };
    return {
      type: "submit",
      payload: { kind: "drunkSwap", centerIndex },
      nextSelections: { players: [], centers: [centerIndex] },
      markConfirmed: true,
    };
  }

  if (roleKey === "troublemaker" && card.type === "player") {
    const nextPlayers = [...selections.players, cardId].slice(0, 2);
    if (nextPlayers.length >= 2) {
      return {
        type: "submit",
        payload: { kind: "troublemakerSwap", targetPlayerIds: [nextPlayers[0], nextPlayers[1]] },
        nextSelections: { players: nextPlayers, centers: [] },
        markConfirmed: true,
      };
    }
    return {
      type: "select",
      nextSelections: { ...selections, players: nextPlayers },
    };
  }

  return { type: "noop" };
};
