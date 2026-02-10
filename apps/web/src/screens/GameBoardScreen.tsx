import { Button } from "../components/Button";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";

export type GameBoardData = {
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

export type GameBoardDevHandle = {
  prevRole: () => void;
  nextRole: () => void;
  showRole: () => void;
  toggleCardsFace: () => void;
  cardsFaceUp: boolean;
  setPlayerCount: (count: number) => void;
  playerCount: number;
};

export const GameBoardScreen = forwardRef<
  GameBoardDevHandle,
  {
    data: GameBoardData;
    isHost?: boolean;
    initialRoleModal?: boolean;
    showHostBar?: boolean;
    showRoleModalOverride?: boolean;
    cardTokenById?: Record<string, string | null | undefined>;
    cardVoteCountById?: Record<string, number | undefined>;
    cardMenuForId?: string | null;
    cardMenuItems?: Array<{ label: string; value: string }>;
    cardMenuPosition?: { placement: "top" | "bottom"; align: "left" | "center" | "right" };
    selectableCardIds?: string[];
    selectedCardIds?: string[];
    blinkCardIds?: string[];
    revealedRoleByCardId?: Record<string, string>;
    cardNoteById?: Record<string, string>;
    eliminatedCardIds?: string[];
    winnerCardIds?: string[];
    onCardMenuSelect?: (cardId: string, role: string | null) => void;
    onCardClick?: (cardId: string, rect: DOMRect) => void;
    onAcknowledge?: () => void;
  }
>(function GameBoardScreen(
  {
    data,
    isHost,
    initialRoleModal = true,
    showHostBar = true,
    cardTokenById,
    showRoleModalOverride,
    cardVoteCountById,
    cardMenuForId,
    cardMenuItems,
    cardMenuPosition,
    selectableCardIds,
    selectedCardIds,
    blinkCardIds,
    revealedRoleByCardId,
    cardNoteById,
    eliminatedCardIds,
    winnerCardIds,
    onCardMenuSelect,
    onCardClick,
    onAcknowledge,
  },
  ref
) {
  const devRoles = [
    { name: "Werewolf", description: "Find the other werewolf or peek a center card if alone." },
    { name: "Minion", description: "See the werewolves and help them win." },
    { name: "Mason", description: "Find the other mason." },
    { name: "Seer", description: "View one player card or two center cards." },
    { name: "Robber", description: "Swap with another player and view your new role." },
    { name: "Troublemaker", description: "Swap two other players' cards." },
    { name: "Drunk", description: "Swap with a random center card without looking." },
    { name: "Insomniac", description: "Peek your card at the end of night." },
    { name: "Doppleganger", description: "Copy another role and act as them." },
    { name: "Tanner", description: "You win if you are eliminated." },
    { name: "Villager", description: "No night action. Blend in and deduce." },
  ];
  const initialRoleIndex = useMemo(() => {
    const idx = devRoles.findIndex((role) => role.name.toLowerCase() === data.role.name.toLowerCase());
    return idx >= 0 ? idx : 0;
  }, [data.role.name]);
  const [roleIndex, setRoleIndex] = useState(initialRoleIndex);
  const [showRoleModal, setShowRoleModal] = useState(initialRoleModal);
  const [cardsFaceUp, setCardsFaceUp] = useState(false);
  const [playerCount, setPlayerCount] = useState(
    data.cards.filter((card) => card.type === "player").length
  );
  const maxPlayers = data.cards.filter((card) => card.type === "player").length;

  useImperativeHandle(ref, () => ({
    prevRole: () => {
      setRoleIndex((prev) => (prev - 1 + devRoles.length) % devRoles.length);
      setShowRoleModal(true);
    },
    nextRole: () => {
      setRoleIndex((prev) => (prev + 1) % devRoles.length);
      setShowRoleModal(true);
    },
    showRole: () => setShowRoleModal(true),
    toggleCardsFace: () => setCardsFaceUp((prev) => !prev),
    cardsFaceUp,
    setPlayerCount: (count: number) => {
      const next = Math.max(3, Math.min(maxPlayers, count));
      setPlayerCount(next);
    },
    playerCount,
  }));

  const roleData = devRoles[roleIndex] ?? data.role;
  const roleImageMap: Record<string, string> = {
    werewolf: "/assets/cards/werewolf.f3ee1e00.jpg",
    minion: "/assets/cards/minion.7e158819.jpg",
    mason: "/assets/cards/mason.1a204ce7.jpg",
    seer: "/assets/cards/seer.4354448c.jpg",
    robber: "/assets/cards/robber.9756e1d3.jpg",
    troublemaker: "/assets/cards/troublemaker.ace70756.jpg",
    drunk: "/assets/cards/drunk.32ee2ceb.jpg",
    doppleganger: "/assets/cards/doppleganger.da67f16f.jpg",
    insomniac: "/assets/cards/insomniac.728282b7.jpg",
    tanner: "/assets/cards/tanner.aa0f20f8.jpg",
    villager: "/assets/cards/villager.99747882.jpg",
  };
  const iconImageMap: Record<string, string> = {
    werewolf: "/assets/icons/werewolf.48c1d1a6.png",
    minion: "/assets/icons/minion.08d75018.png",
    mason: "/assets/icons/mason.27acfbe5.png",
    seer: "/assets/icons/seer.1e6151fb.png",
    robber: "/assets/icons/robber.1a73bfe5.png",
    troublemaker: "/assets/icons/troublemaker.c1cb05ef.png",
    drunk: "/assets/icons/drunk.ed6e8986.png",
    doppleganger: "/assets/icons/doppleganger.bb913254.png",
    insomniac: "/assets/icons/insomniac.efda1179.png",
    tanner: "/assets/icons/tanner.86f18743.png",
    villager: "/assets/icons/villager.c8c8ac2f.png",
  };
  const normalizedRole = roleData.name.toLowerCase();
  const roleImage = roleImageMap[normalizedRole] ?? "/assets/cards/card-back.c0fe042f.jpg";
  const tokenImageFor = (role?: string | null) => {
    if (!role) return null;
    const key = role.toLowerCase();
    return iconImageMap[key] ?? null;
  };
  const imageForRole = (role?: string) => {
    if (!role) return "/assets/cards/card-back.c0fe042f.jpg";
    return roleImageMap[role.toLowerCase()] ?? "/assets/cards/card-back.c0fe042f.jpg";
  };
  const selectedSet = new Set(selectedCardIds ?? []);
  const selectableSet = new Set(selectableCardIds ?? []);
  const blinkSet = new Set(blinkCardIds ?? []);
  const eliminatedSet = new Set(eliminatedCardIds ?? []);
  const winnerSet = new Set(winnerCardIds ?? []);

  useEffect(() => {
    if (typeof showRoleModalOverride === "boolean") {
      setShowRoleModal(showRoleModalOverride);
    }
  }, [showRoleModalOverride]);

  const renderCard = (card: { id: string; label: string; type: "center" | "player" }, hideName = false) => {
    const isSelectable = selectableSet.has(card.id);
    const isSelected = selectedSet.has(card.id);
    const isBlinking = blinkSet.has(card.id);
    const isEliminated = eliminatedSet.has(card.id);
    const isWinner = winnerSet.has(card.id);
    const revealedRole = revealedRoleByCardId?.[card.id];
    const faceImage = cardsFaceUp ? roleImage : imageForRole(revealedRole);
    const note = cardNoteById?.[card.id];
    return (
      <div key={card.id} className="card-stack">
        <div
          className={`card ${onCardClick ? "card-clickable" : ""} ${
            cardTokenById?.[card.id] ? "card-tokened" : ""
          } ${cardVoteCountById?.[card.id] ? "card-voted" : ""} ${
            isSelectable ? "card-selectable" : ""
          } ${isSelected ? "card-selected" : ""} ${isBlinking ? "card-blink" : ""} ${
            isEliminated ? "card-eliminated" : ""
          } ${isWinner ? "card-winner" : ""}`}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onCardClick?.(card.id, rect);
          }}
        >
          <div
            className={`card-face ${revealedRole || cardsFaceUp ? "up" : "down"}`}
            style={{
              backgroundImage: `url(${faceImage})`,
            }}
          />
          {isEliminated || isWinner ? (
            <div className="card-status-row" aria-live="polite">
              {isWinner ? <span className="card-status card-status-winner">Winner</span> : null}
              {!isWinner && isEliminated ? <span className="card-status card-status-eliminated">Eliminated</span> : null}
            </div>
          ) : null}
          {cardTokenById?.[card.id] ? (
            <img className="card-token" src={tokenImageFor(cardTokenById[card.id]) ?? ""} alt="" />
          ) : null}
          {cardVoteCountById?.[card.id] ? (
            <div className="card-vote-count" aria-live="polite">
              {cardVoteCountById[card.id]}
            </div>
          ) : null}
        </div>
        <span className={`card-name ${hideName ? "center-name" : ""}`} aria-hidden={hideName || undefined}>
          {!hideName ? (
            <>
              {card.label}
              {card.label === data.playerName ? <span className="you-badge">You</span> : null}
            </>
          ) : null}
        </span>
        {note ? <span className="card-note">{note}</span> : null}
        {cardMenuForId === card.id && cardMenuItems && cardMenuPosition ? (
          <div
            className={`card-menu card-menu-${cardMenuPosition.placement} card-menu-${cardMenuPosition.align}`}
            role="menu"
          >
            <button type="button" onClick={() => onCardMenuSelect?.(card.id, null)}>
              Clear
            </button>
            {cardMenuItems.map((item) => (
              <button key={item.value} type="button" onClick={() => onCardMenuSelect?.(card.id, item.value)}>
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="board-shell">
      <div className="board-top">
        <div className="phase-bar">
          <div className="phase-pill">
            <span className="phase-label">Phase</span>
            <span className="phase-value">{data.phase}</span>
          </div>
          {typeof data.phaseSecondsRemaining === "number" ? (
            <div className={`phase-timer ${data.phaseSecondsRemaining <= 5 ? "phase-timer-critical" : ""}`}>
              {String(Math.floor(data.phaseSecondsRemaining / 60)).padStart(2, "0")}:
              {String(data.phaseSecondsRemaining % 60).padStart(2, "0")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="board-stage">
        <div className={`board-grid ${showRoleModal ? "board-grid-blur" : ""}`}>
          <div className="center-block">
            <div className="center-label">Center Cards</div>
            <div className="center-row">
              {data.cards.filter((card) => card.type === "center").map((card) => renderCard(card, true))}
            </div>
          </div>
          <div className="player-block">
            <div className="board-divider" />
            <div className="player-grid">
              {data.cards
                .filter((card) => card.type === "player")
                .slice(0, playerCount)
                .map((card) => renderCard(card))}
            </div>
          </div>
        </div>
      </div>

      {showRoleModal ? (
        <div className="overlay">
          <div className="overlay-card role-card">
            <div className="role-card-content">
              <div className="role-info">
                <p className="eyebrow">Your role, keep it secret</p>
                <h3>{roleData.name}</h3>
                <p className="lede">{roleData.description}</p>
                <Button
                  variant="success"
                  onClick={() => {
                    setShowRoleModal(false);
                    onAcknowledge?.();
                  }}
                >
                  Acknowledge
                </Button>
              </div>
              <div className="role-art">
                <img src={roleImage} alt={`${roleData.name} card art`} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isHost && showHostBar ? (
        <div className="host-bar">
          <Button size="small" variant="success">
            Next step
          </Button>
          <Button size="small" variant="ghost">
            Advance phase
          </Button>
        </div>
      ) : null}
    </div>
  );
});
