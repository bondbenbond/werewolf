import { Button } from "../components/Button";
import { GameBoardScreen, type GameBoardData } from "./GameBoardScreen";
import { useEffect, useMemo, useState } from "react";
import { NightOverlays } from "./NightOverlays";
import {
  ROLE_KEYS_REQUIRING_SELECTION,
  ROLE_KEYS_REQUIRING_START_MODAL,
  ROLE_KEYS_REQUIRING_START_TO_REVEAL,
  computeNightSelectable,
  resolveNightCardAction,
} from "./nightRoleHelpers";
import { useNightFlow } from "./useNightFlow";

type Phase = "deal" | "nightCountdown" | "night" | "parallelResult" | "discussion" | "voting" | "reveal";

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
  const [votingCountdownRemaining, setVotingCountdownRemaining] = useState<number | null>(null);
  const [discussionHintVisible, setDiscussionHintVisible] = useState(false);
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
      setVotingCountdownRemaining(null);
    }
  }, [data.phase]);

  useEffect(() => {
    if (data.phase !== "voting") {
      return undefined;
    }
    setVotingReady(false);
    const gateEndsAt = Date.now() + 2000;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((gateEndsAt - Date.now()) / 1000));
      setVotingCountdownRemaining(remaining);
      if (remaining <= 0) {
        setVotingReady(true);
      }
    };
    update();
    const timer = window.setInterval(update, 200);
    return () => {
      window.clearInterval(timer);
      setVotingCountdownRemaining(null);
    };
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

  const roleKey = normalizeRoleKey(data.night.actionRole ?? data.night.role);
  const currentNightStepKey = data.phase === "night" ? data.night.step : null;
  const {
    nightSelections,
    setNightSelections,
    nightActionState,
    setNightActionState,
    nightActionPending,
    nightActionError,
    setNightActionError,
    completedNightStepKey,
    showDoppleFollowupModal,
    setShowDoppleFollowupModal,
    doppleFollowupRoleLabel,
    submitNightAction,
    markNightActionConfirmed,
  } = useNightFlow({
    phase: data.phase,
    nightStep: data.night.step,
    doppleFollowupRole: data.night.doppleFollowupRole,
    currentNightStepKey,
    onNightAction,
  });

  const computedSelectable = useMemo(() => {
    return computeNightSelectable({
      phase: data.phase,
      nightWaiting: data.night.waiting,
      nightActionState,
      nightActionPending,
      roleKey,
      cards: data.board.cards,
      playerId: data.board.playerId,
      selectedCenters: nightSelections.centers,
      selectedPlayers: nightSelections.players,
      werewolfSelectableCardIds: data.night.selectableCardIds,
    });
  }, [data, nightActionPending, nightActionState, nightSelections, roleKey]);

  const selectedCardIds = [
    ...nightSelections.players,
    ...nightSelections.centers.map((centerIndex) => `center-${centerIndex}`),
  ];
  const isSequentialNight = data.phase === "night" && !data.settings?.parallelNight;
  const requiresStartToRevealInfo = ROLE_KEYS_REQUIRING_START_TO_REVEAL.includes(
    roleKey as (typeof ROLE_KEYS_REQUIRING_START_TO_REVEAL)[number]
  );
  const hideNightInfoUntilStart =
    isSequentialNight && requiresStartToRevealInfo && nightActionState === "idle";
  const activeBlinkCardIds =
    data.phase === "night" &&
    !data.night.waiting &&
    !hideNightInfoUntilStart &&
    nightActionState !== "confirmed"
      ? data.night.blinkCardIds
      : undefined;

  const handleNightCardAction = async (cardId: string) => {
    if (!onNightAction || data.phase !== "night" || data.night.waiting || nightActionState !== "selecting" || nightActionPending) {
      return;
    }
    const card = data.board.cards.find((item) => item.id === cardId);
    if (!card) return;
    if (!computedSelectable.includes(cardId)) return;
    const resolvedAction = resolveNightCardAction({
      roleKey,
      card,
      cardId,
      playerId: data.board.playerId,
      selections: nightSelections,
    });

    if (resolvedAction.type === "noop") return;
    if (resolvedAction.type === "select") {
      setNightSelections(resolvedAction.nextSelections);
      return;
    }
    try {
      await submitNightAction(resolvedAction.payload);
      if (resolvedAction.nextSelections) {
        setNightSelections(resolvedAction.nextSelections);
      }
      if (resolvedAction.markConfirmed) {
        markNightActionConfirmed();
      }
    } catch {
      // Error is surfaced via nightActionError state.
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
    ROLE_KEYS_REQUIRING_SELECTION.includes(roleKey as (typeof ROLE_KEYS_REQUIRING_SELECTION)[number]) ||
    werewolfCanSoloPeek;
  const roleHasNoSelection =
    roleKey === "minion" || roleKey === "mason" || (roleKey === "werewolf" && !werewolfCanSoloPeek);
  const roleNeedsStartModal =
    roleNeedsSelection ||
    ROLE_KEYS_REQUIRING_START_MODAL.includes(roleKey as (typeof ROLE_KEYS_REQUIRING_START_MODAL)[number]);
  const showNightWaitingModal = data.phase === "night" && !!data.night.waiting;
  const showNightStartModal =
    data.phase === "night" &&
    !data.night.waiting &&
    roleNeedsStartModal &&
    nightActionState === "idle" &&
    completedNightStepKey !== currentNightStepKey;
  const nextStepLabel = (data.night.nextStep ?? "Discussion").toLowerCase() === "discussion" ? "Next phase" : "Next role";
  const showNightHintBanner = data.phase === "night" && !showNightStartModal && !showNightWaitingModal;
  const startActionLabel = roleKey === "insomniac" ? "Reveal final role" : "Start action";
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
    if (parallelNightFlow && autoAdvanceFlow && data.phase === "night") {
      return { label: "Auto advancing", onClick: undefined, disabled: true };
    }
    if (parallelNightFlow && autoAdvanceFlow && data.phase === "parallelResult") {
      return { label: "Showing results", onClick: undefined, disabled: true };
    }
    if (parallelNightFlow && data.phase === "night") {
      return { label: "Show results", onClick: onAdvanceNightStep, disabled: !onAdvanceNightStep };
    }
    if (parallelNightFlow && data.phase === "parallelResult") {
      return { label: "Next phase", onClick: onAdvanceNightStep, disabled: !onAdvanceNightStep };
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
    (autoAdvanceFlow && parallelNightFlow && (data.phase === "night" || data.phase === "parallelResult"))
  );
  const revealRolesByCardId = revealResultsVisible ? data.reveal.finalRoleByCardId : undefined;
  const revealEliminatedIds = revealResultsVisible ? data.reveal.eliminatedPlayerIds : undefined;
  const revealWinnerIds = revealResultsVisible ? data.reveal.winnerPlayerIds : undefined;
  const revealNotesByCardId = revealResultsVisible ? data.reveal.cardAnnotationsByCardId : undefined;
  const showNightBoardInfo = data.phase === "night";
  const visibleNightReveals = hideNightInfoUntilStart ? undefined : data.night.revealedRolesByCardId;
  const visibleNightNotes = hideNightInfoUntilStart ? undefined : data.night.cardAnnotationsByCardId;
  const isDoppleMinionFollowupStep =
    data.phase === "night" &&
    (data.night.step ?? "").toLowerCase() === "doppleganger" &&
    roleKey === "minion" &&
    (data.night.doppleFollowupRole ?? "").toLowerCase() === "minion";
  const gatedNightReveals =
    isDoppleMinionFollowupStep && nightActionState !== "selecting" && visibleNightReveals
      ? Object.fromEntries(Object.entries(visibleNightReveals).filter(([, role]) => role !== "werewolf"))
      : visibleNightReveals;
  const handleStartNightAction = () => {
    setNightActionError(null);
    if (roleKey === "werewolf" && werewolfPartnerKnown && !werewolfCanSoloPeek) {
      setNightActionState("selecting");
      return;
    }
    if (roleKey === "minion" || roleKey === "mason") {
      setNightActionState("selecting");
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
  };

  useEffect(() => {
    if (!showRoleModal) return;
    forceScrollViewportToTop();
    return undefined;
  }, [showRoleModal]);

  useEffect(() => {
    if (!showNightStartModal && !showNightWaitingModal && !showParallelResultModal && !showDoppleFollowupModal) return;
    forceScrollViewportToTop();
    return undefined;
  }, [showNightStartModal, showNightWaitingModal, showParallelResultModal, showDoppleFollowupModal]);

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
        revealedRoleByCardId={revealRolesByCardId ?? (showNightBoardInfo ? gatedNightReveals : undefined)}
        cardNoteById={showNightBoardInfo ? visibleNightNotes : revealNotesByCardId}
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

      <NightOverlays
        phase={data.phase}
        isHost={isHost}
        phaseRemaining={phaseRemaining}
        boardPhaseSecondsRemaining={data.board.phaseSecondsRemaining ?? null}
        showNightHintBanner={showNightHintBanner}
        nightWaiting={data.night.waiting}
        nightStep={data.night.step}
        nightActionError={nightActionError}
        nightActionPending={nightActionPending}
        roleKey={roleKey}
        nightActionState={nightActionState}
        nightRoleInstruction={data.night.roleInstruction}
        nightInstruction={data.night.instruction}
        showNightStartModal={showNightStartModal}
        nightRole={data.night.role}
        startActionLabel={startActionLabel}
        onStartNightAction={handleStartNightAction}
        showDoppleFollowupModal={showDoppleFollowupModal}
        doppleFollowupRoleLabel={doppleFollowupRoleLabel}
        onStartDoppleAction={() => {
          setNightActionError(null);
          setNightSelections({ players: [], centers: [] });
          setShowDoppleFollowupModal(false);
          setNightActionState("selecting");
        }}
        showNightWaitingModal={showNightWaitingModal}
        nextStepLabel={nextStepLabel}
        nextStep={data.night.nextStep}
        nightCountdown={nightCountdown}
        nightRemaining={data.night.remaining}
        showParallelResultModal={showParallelResultModal}
        parallelResultCountdown={parallelResultCountdown}
        nightResultLines={data.night.resultLines}
        discussionHintVisible={discussionHintVisible}
        votingReady={votingReady}
        votingCountdownRemaining={votingCountdownRemaining}
        revealResultsVisible={revealResultsVisible}
        revealWinners={data.reveal.winners}
        revealEliminated={data.reveal.eliminated}
        onShowRevealResults={() => setRevealResultsVisible(true)}
      />

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
