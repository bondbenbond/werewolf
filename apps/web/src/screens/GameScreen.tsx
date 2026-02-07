import { Button } from "../components/Button";
import { GameBoardScreen, type GameBoardData } from "./GameBoardScreen";
import { useEffect, useState } from "react";

type Phase = "deal" | "nightCountdown" | "night" | "discussion" | "voting" | "reveal";

export type GameScreenData = {
  board: GameBoardData;
  phase: Phase;
  phaseTimer?: string;
  night: {
    step: string;
    instruction: string;
    remaining: string;
    role?: string;
    roleInstruction?: string;
    waiting?: boolean;
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
  onLockVotes,
  onRevealResults,
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
  onLockVotes?: () => void;
  onRevealResults?: () => void;
  onPlaceToken?: (targetId: string, role: string | null) => void;
  onSubmitVote?: (targetPlayerId: string) => void;
  onNightAction?: (payload: Record<string, unknown>) => void;
}) {
  const phaseLabel =
    data.phase === "nightCountdown"
      ? "Night"
      : data.phase.charAt(0).toUpperCase() + data.phase.slice(1);
  const [nightModalOpen, setNightModalOpen] = useState(false);
  const [nightActionStarted, setNightActionStarted] = useState(false);
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
    if (data.phase === "night") {
      setNightActionStarted(false);
      setNightModalOpen(!data.night.waiting);
      setNightSelections({ players: [], centers: [] });
      return;
    }
    setNightActionStarted(false);
    setNightModalOpen(false);
    setNightSelections({ players: [], centers: [] });
  }, [data.phase, data.night.waiting, data.night.step, data.night.role]);

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

  const normalizeRoleKey = (label?: string | null) => (label ? label.toLowerCase() : "");

  const handleNightCardAction = (cardId: string) => {
    if (!onNightAction || !nightActionStarted) return;
    const roleKey = normalizeRoleKey(data.night.role);
    const card = data.board.cards.find((item) => item.id === cardId);
    if (!card) return;
    if (roleKey === "doppleganger" && card.type === "player") {
      onNightAction({ kind: "dopplegangerCopy", targetPlayerId: cardId });
      return;
    }
    if (roleKey === "werewolf" && card.type === "center") {
      const centerIndex = Number(cardId.replace("center-", ""));
      if (!Number.isNaN(centerIndex)) {
        onNightAction({ kind: "werewolfSoloPeek", centerIndex });
      }
      return;
    }
    if (roleKey === "seer") {
      if (card.type === "player") {
        onNightAction({ kind: "seerViewPlayer", targetPlayerId: cardId });
        return;
      }
      if (card.type === "center") {
        const centerIndex = Number(cardId.replace("center-", ""));
        if (Number.isNaN(centerIndex)) return;
        const nextCenters = [...nightSelections.centers, centerIndex];
        if (nextCenters.length >= 2) {
          onNightAction({ kind: "seerViewCenter", centerIndices: [nextCenters[0], nextCenters[1]] });
          setNightSelections({ players: [], centers: [] });
        } else {
          setNightSelections((prev) => ({ ...prev, centers: nextCenters }));
        }
        return;
      }
    }
    if (roleKey === "robber" && card.type === "player") {
      onNightAction({ kind: "robberSwap", targetPlayerId: cardId });
      return;
    }
    if (roleKey === "drunk" && card.type === "center") {
      const centerIndex = Number(cardId.replace("center-", ""));
      if (!Number.isNaN(centerIndex)) {
        onNightAction({ kind: "drunkSwap", centerIndex });
      }
      return;
    }
    if (roleKey === "troublemaker" && card.type === "player") {
      const nextPlayers = [...nightSelections.players, cardId].slice(0, 2);
      if (nextPlayers.length >= 2) {
        onNightAction({ kind: "troublemakerSwap", targetPlayerIds: [nextPlayers[0], nextPlayers[1]] });
        setNightSelections({ players: [], centers: [] });
      } else {
        setNightSelections((prev) => ({ ...prev, players: nextPlayers }));
      }
      return;
    }
    if (roleKey === "insomniac") {
      onNightAction({ kind: "insomniacPeek" });
    }
  };

  const dealCountdown = data.phase === "deal" ? phaseRemaining ?? data.board.phaseSecondsRemaining ?? null : null;
  const showRoleModal =
    data.phase === "deal" && (dealCountdown === null || dealCountdown <= 0) && !dealAcknowledged;

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
          data.phase === "night" && onNightAction && nightActionStarted
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
        <>
          {data.night.waiting ? (
            <div className="overlay">
              <div className="overlay-card action-card">
                <p className="eyebrow">Night in progress</p>
                <h3>Waiting for your turn</h3>
                <p className="lede">Current step: {data.night.step}</p>
                <p className="lede">Up next: {data.night.role ?? data.night.step}</p>
                <p className="lede">{data.night.remaining}</p>
              </div>
            </div>
          ) : nightModalOpen ? (
            <div className="overlay">
              <div className="overlay-card action-card">
                <p className="eyebrow">Your action</p>
                <h3>{data.night.role ?? data.night.step}</h3>
                <p className="lede">{data.night.roleInstruction ?? data.night.instruction}</p>
                <Button
                  variant="success"
                  onClick={() => {
                    setNightModalOpen(false);
                    setNightActionStarted(true);
                    if (onNightAction) {
                      const roleKey = normalizeRoleKey(data.night.role);
                      if (["villager", "minion", "mason", "tanner", "werewolf"].includes(roleKey)) {
                        onNightAction({ kind: "done" });
                      }
                      if (roleKey === "insomniac") {
                        onNightAction({ kind: "insomniacPeek" });
                      }
                    }
                  }}
                >
                  Start action
                </Button>
              </div>
            </div>
          ) : null}
          {nightActionStarted ? (
            <div className={`action-banner ${isHost ? "action-banner-host" : ""}`}>
              <span>{data.night.roleInstruction ?? data.night.instruction}</span>
            </div>
          ) : null}
        </>
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
            onClick={() => {
              if (data.phase === "deal") {
                onStartNight?.();
                return;
              }
              if (data.phase === "night") {
                onAdvanceNightStep?.();
                return;
              }
              if (data.phase === "discussion") {
                onStartVoting?.();
                return;
              }
              if (data.phase === "voting") {
                onLockVotes?.();
              }
            }}
          >
            Next step
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={() => {
              if (data.phase === "voting") {
                onRevealResults?.();
              }
            }}
          >
            Next phase
          </Button>
        </div>
      ) : null}
    </div>
  );
}
