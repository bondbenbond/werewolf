import { CardGrid } from "../components/CardGrid";
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
    cardMenuItems?: string[];
    cardMenuPosition?: { placement: "top" | "bottom"; align: "left" | "center" | "right" };
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
    werewolf: "/assets/cards/werewolf.jpg",
    minion: "/assets/cards/minion.jpg",
    mason: "/assets/cards/mason.jpg",
    seer: "/assets/cards/seer.jpg",
    robber: "/assets/cards/robber.jpg",
    troublemaker: "/assets/cards/troublemaker.jpg",
    drunk: "/assets/cards/drunk.jpg",
    doppleganger: "/assets/cards/doppleganger.jpg",
    insomniac: "/assets/cards/insomniac.jpg",
    tanner: "/assets/cards/tanner.jpg",
    villager: "/assets/cards/villager.jpg",
  };
  const normalizedRole = roleData.name.toLowerCase();
  const roleImage = roleImageMap[normalizedRole] ?? "/assets/cards/card-back.jpg";
  const actionCopy: Record<string, string> = {
    werewolf: "Select another werewolf or peek a center card if solo.",
    minion: "See the werewolves, then acknowledge.",
    mason: "Find the other mason.",
    seer: "Peek one player or two center cards.",
    robber: "Swap with a player and view your new card.",
    troublemaker: "Swap two other players.",
    drunk: "Swap with a center card without looking.",
    insomniac: "Peek your card at end of night.",
    doppleganger: "Copy another role, then perform that action.",
    tanner: "Try to get yourself eliminated.",
    villager: "No action. Keep eyes closed.",
  };
  const tokenImageFor = (role?: string | null) => {
    if (!role) return null;
    const key = role.toLowerCase();
    return `/assets/icons/${key}.png`;
  };
  useEffect(() => {
    if (typeof showRoleModalOverride === "boolean") {
      setShowRoleModal(showRoleModalOverride);
    }
  }, [showRoleModalOverride]);

  return (
    <div className="board-shell">
      <div className="board-top">
        <div className="phase-bar">
          <div className="phase-pill">
            <span className="phase-label">Phase</span>
            <span className="phase-value">{data.phase}</span>
          </div>
          {typeof data.phaseSecondsRemaining === "number" ? (
            <div className="phase-timer">
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
              {data.cards
                .filter((card) => card.type === "center")
                .map((card) => (
                  <div key={card.id} className="card-stack">
                    <div
                      className={`card ${onCardClick ? "card-clickable" : ""} ${
                        cardTokenById?.[card.id] ? "card-tokened" : ""
                      } ${cardVoteCountById?.[card.id] ? "card-voted" : ""}`}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        onCardClick?.(card.id, rect);
                      }}
                    >
                      <div
                        className={`card-face ${cardsFaceUp ? "up" : "down"}`}
                        style={{
                          backgroundImage: cardsFaceUp ? `url(${roleImage})` : "url(/assets/cards/card-back.jpg)",
                        }}
                      />
                      {cardTokenById?.[card.id] ? (
                        <img
                          className="card-token"
                          src={tokenImageFor(cardTokenById[card.id]) ?? ""}
                          alt=""
                        />
                      ) : null}
                      {cardVoteCountById?.[card.id] ? (
                        <div className="card-vote-count" aria-live="polite">
                          {cardVoteCountById[card.id]}
                        </div>
                      ) : null}
                    </div>
                    <span className="card-name center-name" aria-hidden="true" />
                    {cardMenuForId === card.id && cardMenuItems && cardMenuPosition ? (
                      <div
                        className={`card-menu card-menu-${cardMenuPosition.placement} card-menu-${cardMenuPosition.align}`}
                        role="menu"
                      >
                        <button type="button" onClick={() => onCardMenuSelect?.(card.id, null)}>
                          Clear
                        </button>
                        {cardMenuItems.map((role) => (
                          <button key={role} type="button" onClick={() => onCardMenuSelect?.(card.id, role)}>
                            {role}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
            </div>
          </div>
          <div className="player-block">
            <div className="board-divider" />
            <div className="player-grid">
              {data.cards
                .filter((card) => card.type === "player")
                .slice(0, playerCount)
                .map((card) => (
                  <div key={card.id} className="card-stack">
                    <div
                      className={`card ${onCardClick ? "card-clickable" : ""} ${
                        cardTokenById?.[card.id] ? "card-tokened" : ""
                      } ${cardVoteCountById?.[card.id] ? "card-voted" : ""}`}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        onCardClick?.(card.id, rect);
                      }}
                    >
                      <div
                        className={`card-face ${cardsFaceUp ? "up" : "down"}`}
                        style={{
                          backgroundImage: cardsFaceUp ? `url(${roleImage})` : "url(/assets/cards/card-back.jpg)",
                        }}
                      />
                      {cardTokenById?.[card.id] ? (
                        <img
                          className="card-token"
                          src={tokenImageFor(cardTokenById[card.id]) ?? ""}
                          alt=""
                        />
                      ) : null}
                      {cardVoteCountById?.[card.id] ? (
                        <div className="card-vote-count" aria-live="polite">
                          {cardVoteCountById[card.id]}
                        </div>
                      ) : null}
                    </div>
                    <span className="card-name">
                      {card.label}
                      {card.label === data.playerName ? <span className="you-badge">You</span> : null}
                    </span>
                    {cardMenuForId === card.id && cardMenuItems && cardMenuPosition ? (
                      <div
                        className={`card-menu card-menu-${cardMenuPosition.placement} card-menu-${cardMenuPosition.align}`}
                        role="menu"
                      >
                        <button type="button" onClick={() => onCardMenuSelect?.(card.id, null)}>
                          Clear
                        </button>
                        {cardMenuItems.map((role) => (
                          <button key={role} type="button" onClick={() => onCardMenuSelect?.(card.id, role)}>
                            {role}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
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

      {!showRoleModal && false ? (
        <div className="overlay action-overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Action preview</p>
            <h3>{roleData.name}</h3>
            <p className="lede">{actionCopy[normalizedRole] ?? "No action."}</p>
            <Button variant="success">Simulate action</Button>
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
