import { Button } from "../components/Button";
import { GameBoardScreen, type GameBoardData } from "./GameBoardScreen";
import { useEffect, useMemo, useState } from "react";

type Phase = "deal" | "nightCountdown" | "night" | "parallelResult" | "discussion" | "voting" | "reveal";
type ActionState = "idle" | "selecting" | "confirmed";

export type GameScreenData = {
  board: GameBoardData;
  phase: Phase;
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
    roleInstruction?: string;
    waiting?: boolean;
    selectableCardIds?: string[];
    blinkCardIds?: string[];
    revealedRolesByCardId?: Record<string, string>;
    cardAnnotationsByCardId?: Record<string, string>;
  };
  discussion: { timer: string; tokenRoleOptions?: Array<{ label: string; value: string }> };
  voting: { timer: string };
  reveal: {
    eliminated: string;
    winners: string;
    eliminatedPlayerIds?: string[];
    winnerPlayerIds?: string[];
    finalRoleByCardId?: Record<string, string>;
  };
};

export function GameScreen({
  data,
  isHost,
  interactive = true,
  discussionTokensByCard,
  voteCountsByCard,
  onAckRole,
  onStartNight,
  onAdvanceNightStep,
  onStartVoting,
  onRevealResults,
  onEndGame,
  onPlaceToken,
  onSubmitVote,
  onNightAction,
}: {
  data: GameScreenData;
  isHost?: boolean;
  interactive?: boolean;
  discussionTokensByCard?: Record<string, string | null>;
  voteCountsByCard?: Record<string, number>;
  onAckRole?: () => void;
  onStartNight?: () => void;
  onAdvanceNightStep?: () => void;
  onStartVoting?: () => void;
  onRevealResults?: () => void;
  onEndGame?: () => void;
  onPlaceToken?: (targetId: string, role: string | null) => void;
  onSubmitVote?: (targetPlayerId: string) => void;
  onNightAction?: (payload: Record<string, unknown>) => void | Promise<void>;
}) {
  const phaseLabel =
    data.phase === "nightCountdown"
      ? "Night"
      : data.phase === "parallelResult"
      ? "Night Results"
      : data.phase.charAt(0).toUpperCase() + data.phase.slice(1);
  const [dealAcknowledged, setDealAcknowledged] = useState(false);
  const [phaseRemaining, setPhaseRemaining] = useState<number | null>(null);
  const [discussionMenuCardId, setDiscussionMenuCardId] = useState<string | null>(null);
  const [discussionTokens, setDiscussionTokens] = useState<Record<string, string | null>>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [votingReady, setVotingReady] = useState(false);
  const [discussionHintVisible, setDiscussionHintVisible] = useState(false);
  const [nightSelections, setNightSelections] = useState<{ players: string[]; centers: number[] }>({
    players: [],
    centers: [],
  });
  const [nightActionState, setNightActionState] = useState<ActionState>("idle");
  const [nightActionPending, setNightActionPending] = useState(false);
  const [nightActionError, setNightActionError] = useState<string | null>(null);
  const [completedNightStepKey, setCompletedNightStepKey] = useState<string | null>(null);
  const [hostNextLoading, setHostNextLoading] = useState(false);
  const [hostEndLoading, setHostEndLoading] = useState(false);
  const [revealResultsVisible, setRevealResultsVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    placement: "top" | "bottom";
    align: "left" | "center" | "right";
  } | null>(null);
  const discussionRoles = [
    { label: "Werewolf", value: "Werewolf" },
    { label: "Minion", value: "Minion" },
    { label: "Mason", value: "Mason" },
    { label: "Seer", value: "Seer" },
    { label: "Robber", value: "Robber" },
    { label: "Troublemaker", value: "Troublemaker" },
    { label: "Drunk", value: "Drunk" },
    { label: "Insomniac", value: "Insomniac" },
    { label: "Doppleganger", value: "Doppleganger" },
    { label: "Tanner", value: "Tanner" },
    { label: "Villager", value: "Villager" },
  ];

  useEffect(() => {
    if (data.phase !== "deal") {
      setDealAcknowledged(false);
      return;
    }
    setDealAcknowledged(false);
  }, [data.phase]);

  useEffect(() => {
    if (data.phase !== "discussion") {
      setDiscussionMenuCardId(null);
      setMenuPosition(null);
    }
  }, [data.phase]);

  useEffect(() => {
    if (data.phase !== "reveal") {
      setRevealResultsVisible(false);
      return;
    }
    setRevealResultsVisible(false);
  }, [data.phase]);

  useEffect(() => {
    if (data.phase !== "discussion") {
      setDiscussionHintVisible(false);
      return undefined;
    }
    setDiscussionHintVisible(true);
    const timeout = window.setTimeout(() => {
      setDiscussionHintVisible(false);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [data.phase]);

  useEffect(() => {
    if (data.phase !== "voting") {
      setVoteCounts({});
      setVotingReady(false);
    }
  }, [data.phase]);

  useEffect(() => {
    if (data.phase !== "voting") {
      return undefined;
    }
    setVotingReady(false);
    const timeout = window.setTimeout(() => {
      setVotingReady(true);
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [data.phase]);

  useEffect(() => {
    const endsAt = data.phase === "night" ? data.night.endsAt ?? null : data.board.phaseEndsAt ?? null;
    if (!endsAt) {
      setPhaseRemaining(null);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setPhaseRemaining(remaining);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [data.phase, data.board.phaseEndsAt, data.night.endsAt]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [data.phase]);

  useEffect(() => {
    if (data.phase !== "night") {
      setNightSelections({ players: [], centers: [] });
      setNightActionState("idle");
      setNightActionPending(false);
      setNightActionError(null);
      setCompletedNightStepKey(null);
      return;
    }
    setNightSelections({ players: [], centers: [] });
    setNightActionState("idle");
    setNightActionPending(false);
    setNightActionError(null);
    setCompletedNightStepKey(null);
  }, [data.phase, data.night.step]);

  const normalizeRoleKey = (label?: string | null) => (label ? label.toLowerCase() : "");
  const scrollViewportToTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (document.scrollingElement) {
      document.scrollingElement.scrollTop = 0;
    }
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  };
  const forceScrollViewportToTop = () => {
    scrollViewportToTop();
    window.requestAnimationFrame(() => {
      scrollViewportToTop();
    });
    window.setTimeout(() => {
      scrollViewportToTop();
    }, 0);
  };

  const roleKey = normalizeRoleKey(data.night.role);
  const currentNightStepKey = data.phase === "night" ? data.night.step : null;
  const markNightActionConfirmed = () => {
    setNightActionState("confirmed");
    if (currentNightStepKey) {
      setCompletedNightStepKey(currentNightStepKey);
    }
  };

  const computedSelectable = useMemo(() => {
    if (data.phase !== "night" || data.night.waiting || nightActionState !== "selecting" || nightActionPending) {
      return [] as string[];
    }
    if (roleKey === "seer") {
      if (nightSelections.centers.length > 0) {
        return data.board.cards
          .filter((card) => card.type === "center")
          .map((card) => card.id)
          .filter((cardId) => !nightSelections.centers.includes(Number(cardId.replace("center-", ""))));
      }
      return data.board.cards.filter((card) => card.type === "center" || card.type === "player").map((c) => c.id);
    }
    if (roleKey === "robber") {
      return data.board.cards
        .filter((card) => card.type === "player" && card.id !== data.board.playerId)
        .map((card) => card.id);
    }
    if (roleKey === "troublemaker") {
      return data.board.cards
        .filter(
          (card) => card.type === "player" && card.id !== data.board.playerId && !nightSelections.players.includes(card.id)
        )
        .map((card) => card.id);
    }
    if (roleKey === "drunk") {
      return data.board.cards.filter((card) => card.type === "center").map((card) => card.id);
    }
    if (roleKey === "werewolf") {
      return data.night.selectableCardIds ?? [];
    }
    return [];
  }, [data, nightActionPending, nightActionState, nightSelections, roleKey]);

  const selectedCardIds = [
    ...nightSelections.players,
    ...nightSelections.centers.map((centerIndex) => `center-${centerIndex}`),
  ];
  const activeBlinkCardIds =
    data.phase === "night" && !data.night.waiting && nightActionState !== "confirmed"
      ? data.night.blinkCardIds
      : undefined;

  const submitNightAction = async (payload: Record<string, unknown>) => {
    if (!onNightAction) return;
    setNightActionError(null);
    setNightActionPending(true);
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("Action timed out")), 8000);
      });
      await Promise.race([Promise.resolve(onNightAction(payload)), timeoutPromise]);
    } catch (error) {
      const message =
        error instanceof Error && error.message === "Action timed out"
          ? "Action is taking too long. Please try again."
          : "Action failed. Please tap again.";
      setNightActionError(message);
      throw error;
    } finally {
      setNightActionPending(false);
    }
  };

  const handleNightCardAction = async (cardId: string) => {
    if (!onNightAction || data.phase !== "night" || data.night.waiting || nightActionState !== "selecting" || nightActionPending) {
      return;
    }
    const card = data.board.cards.find((item) => item.id === cardId);
    if (!card) return;
    if (!computedSelectable.includes(cardId)) return;

    if (roleKey === "werewolf" && card.type === "center") {
      const centerIndex = Number(cardId.replace("center-", ""));
      if (!Number.isNaN(centerIndex)) {
        try {
          await submitNightAction({ kind: "werewolfSoloPeek", centerIndex });
          markNightActionConfirmed();
        } catch {
          // Error is surfaced via nightActionError state.
        }
      }
      return;
    }
    if (roleKey === "seer") {
      if (card.type === "player") {
        try {
          await submitNightAction({ kind: "seerViewPlayer", targetPlayerId: cardId });
          setNightSelections({ players: [cardId], centers: [] });
          markNightActionConfirmed();
        } catch {
          // Error is surfaced via nightActionError state.
        }
        return;
      }
      if (card.type === "center") {
        const centerIndex = Number(cardId.replace("center-", ""));
        if (Number.isNaN(centerIndex)) return;
        const nextCenters = [...nightSelections.centers, centerIndex].slice(0, 2);
        if (nextCenters.length >= 2) {
          try {
            await submitNightAction({ kind: "seerViewCenter", centerIndices: [nextCenters[0], nextCenters[1]] });
            setNightSelections({ players: [], centers: nextCenters });
            markNightActionConfirmed();
          } catch {
            // Error is surfaced via nightActionError state.
          }
        } else {
          setNightSelections({ players: [], centers: nextCenters });
        }
        return;
      }
    }
    if (roleKey === "robber" && card.type === "player") {
      try {
        await submitNightAction({ kind: "robberSwap", targetPlayerId: cardId });
        setNightSelections({ players: [cardId], centers: [] });
        markNightActionConfirmed();
      } catch {
        // Error is surfaced via nightActionError state.
      }
      return;
    }
    if (roleKey === "drunk" && card.type === "center") {
      const centerIndex = Number(cardId.replace("center-", ""));
      if (!Number.isNaN(centerIndex)) {
        try {
          await submitNightAction({ kind: "drunkSwap", centerIndex });
          setNightSelections({ players: [], centers: [centerIndex] });
          markNightActionConfirmed();
        } catch {
          // Error is surfaced via nightActionError state.
        }
      }
      return;
    }
    if (roleKey === "troublemaker" && card.type === "player") {
      const nextPlayers = [...nightSelections.players, cardId].slice(0, 2);
      if (nextPlayers.length >= 2) {
        try {
          await submitNightAction({ kind: "troublemakerSwap", targetPlayerIds: [nextPlayers[0], nextPlayers[1]] });
          setNightSelections({ players: nextPlayers, centers: [] });
          markNightActionConfirmed();
        } catch {
          // Error is surfaced via nightActionError state.
        }
      } else {
        setNightSelections((prev) => ({ ...prev, players: nextPlayers }));
      }
    }
  };

  const dealCountdown = data.phase === "deal" ? phaseRemaining ?? data.board.phaseSecondsRemaining ?? null : null;
  const showRoleModal =
    data.phase === "deal" && (dealCountdown === null || dealCountdown <= 0) && !dealAcknowledged;
  const nightCountdown =
    data.phase === "night"
      ? phaseRemaining ?? data.night.secondsRemaining ?? data.board.phaseSecondsRemaining ?? null
      : null;
  const parallelResultCountdown =
    data.phase === "parallelResult" ? phaseRemaining ?? data.board.phaseSecondsRemaining ?? null : null;
  const werewolfCanSoloPeek =
    roleKey === "werewolf" && (data.night.selectableCardIds?.length ?? 0) > 0;
  const werewolfPartnerKnown = roleKey === "werewolf" && (data.night.blinkCardIds?.length ?? 0) > 0;
  const roleNeedsSelection =
    ["seer", "robber", "troublemaker", "drunk"].includes(roleKey) || werewolfCanSoloPeek;
  const roleNeedsStartModal =
    roleNeedsSelection ||
    ["werewolf", "insomniac", "minion", "mason"].includes(roleKey);
  const showNightWaitingModal = data.phase === "night" && !!data.night.waiting;
  const showNightStartModal =
    data.phase === "night" &&
    !data.night.waiting &&
    roleNeedsStartModal &&
    nightActionState === "idle" &&
    completedNightStepKey !== currentNightStepKey;
  const nextStepLabel = (data.night.nextStep ?? "Discussion").toLowerCase() === "discussion" ? "Next phase" : "Next role";
  const showNightHintBanner = data.phase === "night" && !showNightStartModal && !showNightWaitingModal;
  const showParallelResultModal = data.phase === "parallelResult";
  const boardPhaseSecondsRemaining =
    data.phase === "night"
      ? nightCountdown
      : data.phase === "parallelResult"
      ? parallelResultCountdown
      : data.phase === "nightCountdown" || data.phase === "deal"
      ? phaseRemaining ?? data.board.phaseSecondsRemaining ?? null
      : phaseRemaining ?? data.board.phaseSecondsRemaining ?? null;
  const autoAdvanceFlow = !!data.settings?.autoAdvance;
  const parallelNightFlow = !!data.settings?.parallelNight;
  const hostNextAction = useMemo(() => {
    if (data.phase === "deal") {
      return { label: "Start night", onClick: onStartNight, disabled: !onStartNight };
    }
    if (parallelNightFlow && data.phase === "night") {
      return { label: "Auto advancing", onClick: undefined, disabled: true };
    }
    if (parallelNightFlow && data.phase === "parallelResult") {
      return { label: "Showing results", onClick: undefined, disabled: true };
    }
    if (autoAdvanceFlow && data.phase === "night") {
      return { label: "Auto advancing", onClick: undefined, disabled: true };
    }
    if (data.phase === "night") {
      return { label: "Next role", onClick: onAdvanceNightStep, disabled: !onAdvanceNightStep };
    }
    if (autoAdvanceFlow && data.phase === "discussion") {
      return { label: "Start vote early", onClick: onStartVoting, disabled: !onStartVoting };
    }
    if (data.phase === "discussion") {
      return { label: "Start voting", onClick: onStartVoting, disabled: !onStartVoting };
    }
    if (autoAdvanceFlow && data.phase === "voting") {
      return { label: "Reveal now", onClick: onRevealResults, disabled: !onRevealResults };
    }
    if (data.phase === "voting") {
      return { label: "Reveal results", onClick: onRevealResults, disabled: !onRevealResults };
    }
    if (data.phase === "reveal") {
      return { label: "Back to lobby", onClick: onEndGame, disabled: !onEndGame };
    }
    return { label: "Next", onClick: undefined, disabled: true };
  }, [autoAdvanceFlow, data.phase, onAdvanceNightStep, onEndGame, onRevealResults, onStartNight, onStartVoting, parallelNightFlow]);
  const showHostProgressButton = !(
    (autoAdvanceFlow && data.phase === "night") ||
    (parallelNightFlow && (data.phase === "night" || data.phase === "parallelResult"))
  );
  const revealRolesByCardId = revealResultsVisible ? data.reveal.finalRoleByCardId : undefined;
  const revealEliminatedIds = revealResultsVisible ? data.reveal.eliminatedPlayerIds : undefined;
  const revealWinnerIds = revealResultsVisible ? data.reveal.winnerPlayerIds : undefined;

  useEffect(() => {
    if (data.phase !== "night" || roleKey !== "werewolf" || nightActionState !== "selecting") return;
    if (!werewolfCanSoloPeek && werewolfPartnerKnown) {
      markNightActionConfirmed();
    }
  }, [data.phase, roleKey, nightActionState, werewolfCanSoloPeek, werewolfPartnerKnown]);

  useEffect(() => {
    if (!showRoleModal) return;
    forceScrollViewportToTop();
    return undefined;
  }, [showRoleModal]);

  useEffect(() => {
    if (!showNightStartModal && !showNightWaitingModal && !showParallelResultModal) return;
    forceScrollViewportToTop();
    return undefined;
  }, [showNightStartModal, showNightWaitingModal, showParallelResultModal]);

  return (
    <div className="game-shell">
      <GameBoardScreen
        data={{
          ...data.board,
          phase: phaseLabel,
          phaseSecondsRemaining: boardPhaseSecondsRemaining ?? undefined,
        }}
        isHost={isHost}
        initialRoleModal={data.phase === "deal"}
        showRoleModalOverride={showRoleModal}
        showHostBar={false}
        selectableCardIds={computedSelectable}
        selectedCardIds={selectedCardIds}
        blinkCardIds={activeBlinkCardIds}
        revealedRoleByCardId={revealRolesByCardId ?? data.night.revealedRolesByCardId}
        cardNoteById={data.night.cardAnnotationsByCardId}
        eliminatedCardIds={revealEliminatedIds}
        winnerCardIds={revealWinnerIds}
        cardTokenById={
          data.phase === "discussion"
            ? interactive
              ? discussionTokens
              : discussionTokensByCard
            : undefined
        }
        cardVoteCountById={
          data.phase === "voting" ? (interactive ? voteCounts : voteCountsByCard) : undefined
        }
        cardMenuForId={data.phase === "discussion" ? discussionMenuCardId : null}
        cardMenuItems={data.phase === "discussion" ? data.discussion.tokenRoleOptions ?? discussionRoles : undefined}
        cardMenuPosition={menuPosition ?? undefined}
        onAcknowledge={() => {
          setDealAcknowledged(true);
          forceScrollViewportToTop();
          onAckRole?.();
        }}
        onCardClick={
          data.phase === "night" && onNightAction
            ? (cardId) => {
                void handleNightCardAction(cardId);
              }
            : data.phase === "discussion" && (interactive || onPlaceToken)
            ? (cardId, rect) => {
                const placeAbove = rect.top > 280;
                const centerX = rect.left + rect.width / 2;
                const align =
                  centerX < 140 ? "left" : centerX > window.innerWidth - 140 ? "right" : "center";
                setMenuPosition({
                  placement: placeAbove ? "top" : "bottom",
                  align,
                });
                setDiscussionMenuCardId(cardId);
              }
            : data.phase === "voting" && votingReady && (interactive || onSubmitVote)
            ? (cardId, _rect) => {
                const cardType = data.board.cards.find((card) => card.id === cardId)?.type;
                if (cardType !== "player") {
                  return;
                }
                if (cardId === data.board.playerId) {
                  return;
                }
                if (onSubmitVote) {
                  onSubmitVote(cardId);
                } else {
                  setVoteCounts((prev) => ({
                    ...prev,
                    [cardId]: (prev[cardId] ?? 0) + 1,
                  }));
                }
              }
            : undefined
        }
        onCardMenuSelect={
          data.phase === "discussion" && (interactive || onPlaceToken)
            ? (cardId, role) => {
                if (onPlaceToken) {
                  onPlaceToken(cardId, role);
                } else {
                  setDiscussionTokens((prev) => ({ ...prev, [cardId]: role }));
                }
                setDiscussionMenuCardId(null);
                setMenuPosition(null);
              }
            : undefined
        }
      />

      {data.phase === "nightCountdown" ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Night starting</p>
            <h3>Get ready</h3>
            <p className="lede">
              Beginning in {phaseRemaining ?? data.board.phaseSecondsRemaining ?? "a moment"}...
            </p>
          </div>
        </div>
      ) : null}

      {showNightHintBanner ? (
        <div className={`action-banner ${isHost ? "action-banner-host" : ""}`}>
          <span>
            {data.night.waiting
              ? `Waiting · ${data.night.step}`
              : nightActionError
              ? nightActionError
              : nightActionPending
              ? ["seer", "werewolf", "drunk"].includes(roleKey)
                ? "Revealing card..."
                : "Submitting action..."
              : nightActionState === "confirmed"
              ? ["mason", "minion"].includes(roleKey)
                ? `Action confirmed · ${data.night.roleInstruction ?? data.night.instruction}`
                : "Action confirmed"
              : data.night.roleInstruction ?? data.night.instruction}
          </span>
        </div>
      ) : null}

      {showNightStartModal ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Your action</p>
            <h3>{data.night.role ?? "Role action"}</h3>
            <p className="lede">{data.night.roleInstruction ?? data.night.instruction}</p>
            <Button
              variant="success"
              loading={nightActionPending}
              disabled={nightActionPending}
              onClick={() => {
                setNightActionError(null);
                if (roleKey === "werewolf" && werewolfPartnerKnown && !werewolfCanSoloPeek) {
                  markNightActionConfirmed();
                  return;
                }
                if (roleKey === "minion" || roleKey === "mason") {
                  markNightActionConfirmed();
                  return;
                }
                if (roleKey === "insomniac") {
                  void (async () => {
                    try {
                      await submitNightAction({ kind: "insomniacPeek" });
                      markNightActionConfirmed();
                    } catch {
                      // Error is surfaced via nightActionError state.
                    }
                  })();
                  return;
                }
                setNightActionState("selecting");
              }}
            >
              Start action
            </Button>
          </div>
        </div>
      ) : null}

      {showNightWaitingModal ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Waiting</p>
            <h3>Waiting for your turn</h3>
            <p className="lede">Current role: {data.night.step}</p>
            <p className="lede">{nextStepLabel}: {data.night.nextStep ?? "Discussion"}</p>
            <p className="lede">{nightCountdown !== null ? `Time left: ${nightCountdown}s` : data.night.remaining}</p>
          </div>
        </div>
      ) : null}

      {showParallelResultModal ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Night results</p>
            <h3>{data.night.role ?? "Your result"}</h3>
            <p className="lede">
              {data.night.roleInstruction ?? data.night.instruction}
            </p>
            <p className="lede">
              {parallelResultCountdown !== null
                ? `Discussion starts in ${parallelResultCountdown}s`
                : "Discussion starts soon"}
            </p>
          </div>
        </div>
      ) : null}

      {data.phase === "discussion" && discussionHintVisible ? (
        <div className="action-banner">
          <span>Tap a player to place a suspicion coin</span>
        </div>
      ) : null}

      {data.phase === "voting" ? (
        votingReady ? (
          <div className="action-banner">
            <span>Tap a player to vote</span>
          </div>
        ) : (
          <div className="overlay">
            <div className="overlay-card action-card">
              <p className="eyebrow">Voting</p>
              <h3>Cast your vote</h3>
              <p className="lede">Starting in 2 seconds…</p>
            </div>
          </div>
        )
      ) : null}

      {data.phase === "reveal" && !revealResultsVisible ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Reveal</p>
            <h3>Winners: {data.reveal.winners}</h3>
            <p className="lede">Eliminated: {data.reveal.eliminated}</p>
            <Button variant="success" onClick={() => setRevealResultsVisible(true)}>
              Show results
            </Button>
          </div>
        </div>
      ) : null}

      {isHost ? (
        <div className="host-bar">
          {showHostProgressButton ? (
            <Button
              size="small"
              variant="success"
              loading={hostNextLoading}
              onClick={async () => {
                if (!hostNextAction.onClick || hostNextLoading) return;
                setHostNextLoading(true);
                try {
                  await Promise.resolve(hostNextAction.onClick());
                } finally {
                  setHostNextLoading(false);
                }
              }}
              disabled={hostNextAction.disabled}
            >
              {hostNextAction.label}
            </Button>
          ) : null}
          <Button
            size="small"
            variant="ghost"
            loading={hostEndLoading}
            onClick={async () => {
              if (!onEndGame || hostEndLoading) return;
              setHostEndLoading(true);
              try {
                await Promise.resolve(onEndGame());
              } finally {
                setHostEndLoading(false);
              }
            }}
            disabled={!onEndGame}
          >
            End game
          </Button>
        </div>
      ) : data.phase === "deal" ? (
        <div className="host-bar">
          <Button size="small" variant="ghost" disabled>
            Waiting for host to start night
          </Button>
        </div>
      ) : null}
    </div>
  );
}
