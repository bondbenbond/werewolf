import { Button } from "../components/Button";
import { GameBoardScreen, type GameBoardData } from "./GameBoardScreen";
import { useEffect, useState } from "react";

type Phase = "deal" | "night" | "discussion" | "voting" | "reveal";

type GameScreenData = {
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

export function GameScreen({ data, isHost }: { data: GameScreenData; isHost?: boolean }) {
  const phaseLabel = data.phase.charAt(0).toUpperCase() + data.phase.slice(1);
  const [nightModalOpen, setNightModalOpen] = useState(false);
  const [nightActionStarted, setNightActionStarted] = useState(false);
  const [discussionMenuCardId, setDiscussionMenuCardId] = useState<string | null>(null);
  const [discussionTokens, setDiscussionTokens] = useState<Record<string, string | null>>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [votingReady, setVotingReady] = useState(false);
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
      return;
    }
    setNightActionStarted(false);
    setNightModalOpen(false);
  }, [data.phase, data.night.waiting, data.night.step, data.night.role]);

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
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [data.phase]);

  return (
    <div className="game-shell">
      <GameBoardScreen
        data={{
          ...data.board,
          phase: phaseLabel,
        }}
        isHost={isHost}
        initialRoleModal={data.phase === "deal"}
        showHostBar={false}
        cardTokenById={data.phase === "discussion" ? discussionTokens : undefined}
        cardVoteCountById={data.phase === "voting" ? voteCounts : undefined}
        cardMenuForId={data.phase === "discussion" ? discussionMenuCardId : null}
        cardMenuItems={data.phase === "discussion" ? discussionRoles : undefined}
        cardMenuPosition={menuPosition ?? undefined}
        onCardClick={
          data.phase === "discussion"
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
            : data.phase === "voting" && votingReady
              ? (cardId, _rect) => {
                  const cardType = data.board.cards.find((card) => card.id === cardId)?.type;
                  if (cardType !== "player") {
                    return;
                  }
                  setVoteCounts((prev) => ({
                    ...prev,
                    [cardId]: (prev[cardId] ?? 0) + 1,
                  }));
                }
              : undefined
        }
        onCardMenuSelect={
          data.phase === "discussion"
            ? (cardId, role) => {
                setDiscussionTokens((prev) => ({ ...prev, [cardId]: role }));
                setDiscussionMenuCardId(null);
                setMenuPosition(null);
              }
            : undefined
        }
      />

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
              <p className="lede">Starting in 5 seconds…</p>
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
          <Button size="small" variant="success">
            Next step
          </Button>
          <Button size="small" variant="ghost">
            Next phase
          </Button>
        </div>
      ) : null}
    </div>
  );
}
