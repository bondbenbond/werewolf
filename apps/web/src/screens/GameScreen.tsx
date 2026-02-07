import { Button } from "../components/Button";
import { GameBoardScreen, type GameBoardData } from "./GameBoardScreen";
import { useEffect, useMemo, useState } from "react";

type Phase = "deal" | "nightCountdown" | "night" | "discussion" | "voting" | "reveal";
type ActionState = "idle" | "selecting" | "confirmed";

export type GameScreenData = {
  board: GameBoardData;
  phase: Phase;
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
  onNightAction?: (payload: Record<string, unknown>) => void;
}) {
  const phaseLabel =
    data.phase === "nightCountdown"
      ? "Night"
      : data.phase.charAt(0).toUpperCase() + data.phase.slice(1);
  const [dealAcknowledged, setDealAcknowledged] = useState(false);
  const [phaseRemaining, setPhaseRemaining] = useState<number | null>(null);
  const [discussionMenuCardId, setDiscussionMenuCardId] = useState<string | null>(null);
  const [discussionTokens, setDiscussionTokens] = useState<Record<string, string | null>>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [votingReady, setVotingReady] = useState(false);
  const [nightSelections, setNightSelections] = useState<{ players: string[]; centers: number[] }>({
    players: [],
    centers: [],
  });
  const [nightActionState, setNightActionState] = useState<ActionState>("idle");
  const [hostNextLoading, setHostNextLoading] = useState(false);
  const [hostEndLoading, setHostEndLoading] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    placement: "top" | "bottom";
    align: "left" | "center" | "right";
  } | null>(null);
  const discussionRoles = [
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
    const endsAt = data.board.phaseEndsAt ?? null;
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
  }, [data.board.phaseEndsAt]);

  useEffect(() => {
    if (data.phase !== "night") {
      setNightSelections({ players: [], centers: [] });
      setNightActionState("idle");
      return;
    }
    setNightSelections({ players: [], centers: [] });
    setNightActionState("idle");
  }, [data.phase, data.night.step, data.night.role, data.night.waiting]);

  const normalizeRoleKey = (label?: string | null) => (label ? label.toLowerCase() : "");

  const roleKey = normalizeRoleKey(data.night.role);

  const computedSelectable = useMemo(() => {
    if (data.phase !== "night" || data.night.waiting || nightActionState !== "selecting") return [] as string[];
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
  }, [data, nightActionState, nightSelections, roleKey]);

  const selectedCardIds = [
    ...nightSelections.players,
    ...nightSelections.centers.map((centerIndex) => `center-${centerIndex}`),
  ];

  const handleNightCardAction = (cardId: string) => {
    if (!onNightAction || data.phase !== "night" || data.night.waiting || nightActionState !== "selecting") return;
    const card = data.board.cards.find((item) => item.id === cardId);
    if (!card) return;
    if (!computedSelectable.includes(cardId)) return;

    if (roleKey === "werewolf" && card.type === "center") {
      const centerIndex = Number(cardId.replace("center-", ""));
      if (!Number.isNaN(centerIndex)) {
        onNightAction({ kind: "werewolfSoloPeek", centerIndex });
        setNightActionState("confirmed");
      }
      return;
    }
    if (roleKey === "seer") {
      if (card.type === "player") {
        onNightAction({ kind: "seerViewPlayer", targetPlayerId: cardId });
        setNightSelections({ players: [cardId], centers: [] });
        setNightActionState("confirmed");
        return;
      }
      if (card.type === "center") {
        const centerIndex = Number(cardId.replace("center-", ""));
        if (Number.isNaN(centerIndex)) return;
        const nextCenters = [...nightSelections.centers, centerIndex].slice(0, 2);
        if (nextCenters.length >= 2) {
          onNightAction({ kind: "seerViewCenter", centerIndices: [nextCenters[0], nextCenters[1]] });
          setNightSelections({ players: [], centers: nextCenters });
          setNightActionState("confirmed");
        } else {
          setNightSelections({ players: [], centers: nextCenters });
        }
        return;
      }
    }
    if (roleKey === "robber" && card.type === "player") {
      onNightAction({ kind: "robberSwap", targetPlayerId: cardId });
      setNightSelections({ players: [cardId], centers: [] });
      setNightActionState("confirmed");
      return;
    }
    if (roleKey === "drunk" && card.type === "center") {
      const centerIndex = Number(cardId.replace("center-", ""));
      if (!Number.isNaN(centerIndex)) {
        onNightAction({ kind: "drunkSwap", centerIndex });
        setNightSelections({ players: [], centers: [centerIndex] });
        setNightActionState("confirmed");
      }
      return;
    }
    if (roleKey === "troublemaker" && card.type === "player") {
      const nextPlayers = [...nightSelections.players, cardId].slice(0, 2);
      if (nextPlayers.length >= 2) {
        onNightAction({ kind: "troublemakerSwap", targetPlayerIds: [nextPlayers[0], nextPlayers[1]] });
        setNightSelections({ players: nextPlayers, centers: [] });
        setNightActionState("confirmed");
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
      ? data.night.secondsRemaining ?? phaseRemaining ?? data.board.phaseSecondsRemaining ?? null
      : null;
  const roleNeedsSelection = ["werewolf", "seer", "robber", "troublemaker", "drunk"].includes(roleKey);
  const showNightWaitingModal = data.phase === "night" && !!data.night.waiting;
  const showNightStartModal =
    data.phase === "night" && !data.night.waiting && roleNeedsSelection && nightActionState === "idle";
  const hostNextAction = useMemo(() => {
    if (data.phase === "deal") {
      return { label: "Start night", onClick: onStartNight, disabled: !onStartNight };
    }
    if (data.phase === "night") {
      return { label: "Next role", onClick: onAdvanceNightStep, disabled: !onAdvanceNightStep };
    }
    if (data.phase === "discussion") {
      return { label: "Start voting", onClick: onStartVoting, disabled: !onStartVoting };
    }
    if (data.phase === "voting") {
      return { label: "Reveal results", onClick: onRevealResults, disabled: !onRevealResults };
    }
    if (data.phase === "reveal") {
      return { label: "Back to lobby", onClick: onEndGame, disabled: !onEndGame };
    }
    return { label: "Next", onClick: undefined, disabled: true };
  }, [data.phase, onAdvanceNightStep, onEndGame, onRevealResults, onStartNight, onStartVoting]);

  return (
    <div className="game-shell">
      <GameBoardScreen
        data={{
          ...data.board,
          phase: phaseLabel,
        }}
        isHost={isHost}
        initialRoleModal={data.phase === "deal"}
        showRoleModalOverride={showRoleModal}
        showHostBar={false}
        selectableCardIds={computedSelectable}
        selectedCardIds={selectedCardIds}
        blinkCardIds={data.night.blinkCardIds}
        revealedRoleByCardId={data.night.revealedRolesByCardId}
        cardNoteById={data.night.cardAnnotationsByCardId}
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
        cardMenuItems={data.phase === "discussion" ? discussionRoles : undefined}
        cardMenuPosition={menuPosition ?? undefined}
        onAcknowledge={() => {
          setDealAcknowledged(true);
          onAckRole?.();
        }}
        onCardClick={
          data.phase === "night" && onNightAction
            ? (cardId) => {
                handleNightCardAction(cardId);
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

      {data.phase === "deal" && dealCountdown !== null && dealCountdown > 0 ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Game starting</p>
            <h3>Host started the game</h3>
            <p className="lede">Dealing in {dealCountdown}s</p>
          </div>
        </div>
      ) : null}

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

      {data.phase === "night" ? (
        <div className={`action-banner ${isHost ? "action-banner-host" : ""}`}>
          <span>
            {data.night.waiting
              ? `Waiting · ${data.night.step}`
              : nightActionState === "confirmed"
              ? `Action confirmed · ${data.night.roleInstruction ?? data.night.instruction}`
              : data.night.roleInstruction ?? data.night.instruction}
            {nightCountdown !== null ? ` · ${nightCountdown}s` : ""}
          </span>
        </div>
      ) : null}

      {showNightStartModal ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Your action</p>
            <h3>{data.night.role ?? "Role action"}</h3>
            <p className="lede">{data.night.roleInstruction ?? data.night.instruction}</p>
            <Button variant="success" onClick={() => setNightActionState("selecting")}>
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
            <p className="lede">Next role: {data.night.nextStep ?? "Discussion"}</p>
            <p className="lede">{nightCountdown !== null ? `Time left: ${nightCountdown}s` : data.night.remaining}</p>
          </div>
        </div>
      ) : null}

      {data.phase === "discussion" ? (
        <div className="action-banner">
          <span>Discussion started · {data.discussion.timer} left · Tap a player to assign a token</span>
        </div>
      ) : null}

      {data.phase === "voting" ? (
        votingReady ? (
          <div className="action-banner">
            <span>Tap a player to vote · {data.voting.timer} left</span>
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

      {data.phase === "reveal" ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Reveal</p>
            <h3>Winners: {data.reveal.winners}</h3>
            <p className="lede">Eliminated: {data.reveal.eliminated}</p>
          </div>
        </div>
      ) : null}

      {isHost ? (
        <div className="host-bar">
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
      ) : null}
    </div>
  );
}
