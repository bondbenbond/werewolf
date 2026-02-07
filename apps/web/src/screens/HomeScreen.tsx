import { useRef, useState } from "react";
import { useApiEnv } from "../api/ApiContext";
import { ApiError, createGame, joinGame } from "../api/client";
import { persistSession, type SessionInfo } from "../api/session";
import { Button } from "../components/Button";

type HomeScreenProps = {
  onSession?: (session: SessionInfo) => void;
  resumeSession?: SessionInfo | null;
  onResumeSession?: (session: SessionInfo) => void;
  onDismissResume?: () => void;
};

export function HomeScreen({
  onSession,
  resumeSession,
  onResumeSession,
  onDismissResume,
}: HomeScreenProps) {
  const env = useApiEnv();
  const [playerName, setPlayerName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [pin, setPin] = useState<string[]>(Array.from({ length: 6 }, () => ""));
  const [modal, setModal] = useState<"how" | "rules" | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const closeModal = () => setModal(null);
  const pinRefs = useRef<Array<HTMLInputElement | null>>([]);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const setPinDigit = (index: number, value: string) => {
    const next = [...pin];
    next[index] = value;
    setPin(next);
  };
  const handlePinChange = async (index: number, value: string) => {
    const digit = value.replace(/[^0-9]/g, "").slice(0, 1);
    const next = [...pin];
    next[index] = digit;
    setPin(next);
    if (digit && pinRefs.current[index + 1]) {
      pinRefs.current[index + 1]?.focus();
    }
    if (digit && index === pin.length - 1) {
      await attemptJoin(next);
    }
  };
  const handlePinKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (/^[0-9]$/.test(event.key)) {
      const next = [...pin];
      next[index] = event.key;
      setPin(next);
      if (pinRefs.current[index + 1]) {
        pinRefs.current[index + 1]?.focus();
      }
      if (index === pin.length - 1) {
        void attemptJoin(next);
      }
      event.preventDefault();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void attemptJoin();
      return;
    }
    if (event.key === "Backspace" && !pin[index] && pinRefs.current[index - 1]) {
      pinRefs.current[index - 1]?.focus();
    }
  };
  const handlePinPaste = async (event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text").replace(/[^0-9]/g, "");
    if (!text) return;
    const next = Array.from({ length: 6 }, (_, idx) => text[idx] ?? "");
    setPin(next);
    const nextIndex = Math.min(text.length, 6) - 1;
    if (nextIndex >= 0) {
      pinRefs.current[nextIndex]?.focus();
    }
    await attemptJoin(next);
    event.preventDefault();
  };

  const focusFirstPin = () => {
    pinRefs.current[0]?.focus();
  };

  const requireName = () => {
    if (!playerName.trim()) {
      setNameError(true);
      nameRef.current?.focus();
      return false;
    }
    return true;
  };

  const storeSession = (session: SessionInfo) => {
    persistSession(session);
    onSession?.(session);
  };

  const attemptJoin = async (nextPin: string[] = pin) => {
    if (submitting) return;
    if (!requireName()) return;
    const code = nextPin.join("");
    if (code.length !== 6 || nextPin.some((digit) => !digit)) {
      return;
    }
    setSubmitting(true);
    setApiError(null);
    try {
      const response = await joinGame(env, code, playerName.trim());
      storeSession({
        gameId: code,
        playerId: response.playerId,
        secret: response.secret,
        name: response.name,
        isHost: false,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "GAME_NOT_FOUND") {
        setApiError(`Game ${code} does not exist. Check the code and try again.`);
      } else {
        setApiError((error as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const attemptCreate = async () => {
    if (submitting) return;
    if (!requireName()) return;
    setSubmitting(true);
    setApiError(null);
    try {
      const response = await createGame(env, playerName.trim());
      storeSession({
        gameId: response.gameId,
        playerId: response.host.playerId,
        secret: response.host.secret,
        name: response.host.name,
        isHost: true,
      });
    } catch (error) {
      setApiError((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="home-wrap">
      <div className="home-header">
        <p className="eyebrow">One-night social deduction</p>
        <h2>One Night Ultimate Werewolf</h2>
        <p className="lede">Host in minutes or jump in with a room code.</p>
      </div>

      {resumeSession ? (
        <div className="glass" style={{ marginBottom: 16 }}>
          <p className="eyebrow">Resume previous session</p>
          <p className="lede" style={{ marginTop: 6 }}>
            Rejoin room {resumeSession.gameId} as {resumeSession.name}.
          </p>
          <div className="cta-row" style={{ marginTop: 10 }}>
            <Button variant="success" onClick={() => onResumeSession?.(resumeSession)}>
              Resume
            </Button>
            <Button variant="ghost" onClick={() => onDismissResume?.()}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <div className="home-global-inputs">
        <div className="field">
          <label htmlFor="player-name">Your name</label>
          <input
            id="player-name"
            ref={nameRef}
            className={`input ${nameError ? "input-error" : ""}`}
            placeholder="Enter your name"
            value={playerName}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              setPlayerName(event.target.value);
              if (event.target.value.trim()) {
                setNameError(false);
              }
              if (apiError) {
                setApiError(null);
              }
            }}
          />
          {nameError ? (
            <p className="micro error-text" role="alert">
              Name is required to continue.
            </p>
          ) : null}
          {apiError ? (
            <p className="micro error-text" role="alert">
              {apiError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="home-actions">
        <div
          className="home-card primary"
          role="button"
          tabIndex={0}
          onClick={() => {
            if (requireName()) {
              focusFirstPin();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (requireName()) {
                focusFirstPin();
              }
            }
          }}
          aria-disabled={submitting}
        >
          <h3>Join a game</h3>
          <p className="micro">Have a room code? Jump right in.</p>
          <div className="pin-input">
            {pin.map((digit, index) => (
              <input
                key={`pin-${index}`}
                ref={(el) => {
                  pinRefs.current[index] = el;
                }}
                value={digit}
                inputMode="numeric"
                className="pin-box"
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => handlePinChange(index, event.target.value)}
                onKeyDown={(event) => handlePinKeyDown(index, event)}
                onPaste={handlePinPaste}
                aria-label={`Digit ${index + 1}`}
              />
            ))}
          </div>
        </div>

        <div
          className="home-card secondary"
          role="button"
          tabIndex={0}
          onClick={() => {
            attemptCreate();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              attemptCreate();
            }
          }}
        >
          <h3>Create a game</h3>
          <p className="micro">Host a room and choose roles before players join.</p>
        </div>
      </div>

      <div className="home-links">
        <button className="link-button" type="button" onClick={() => setModal("how")}>
          How to play
        </button>
        <span className="link-dot">·</span>
        <button className="link-button" type="button" onClick={() => setModal("rules")}>
          Rules
        </button>
      </div>

      {modal ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeModal();
          }}
          tabIndex={-1}
        >
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === "how" ? "How to play" : "Rules"}</h3>
              <button className="modal-close" type="button" onClick={closeModal}>
                Close
              </button>
            </div>
            {modal === "how" ? (
              <div className="modal-body">
                <div className="modal-section">
                  <h4>Flow</h4>
                  <ol className="modal-list">
                    <li>Lobby: join the room, set roles, and mark ready.</li>
                    <li>Deal: everyone learns their secret role.</li>
                    <li>Night: roles act in order (some swap, some learn info).</li>
                    <li>Discussion: talk and place public suspicion tokens.</li>
                    <li>Voting: each player votes once.</li>
                    <li>Reveal: final roles are shown and winners are declared.</li>
                  </ol>
                </div>
                <div className="modal-section">
                  <h4>Key rule</h4>
                  <p className="lede">
                    Swaps change your final role, but your night action is based on your original
                    role.
                  </p>
                </div>
              </div>
            ) : (
              <div className="modal-body">
                <div className="modal-section">
                  <h4>Roles</h4>
                  <ul className="modal-list">
                    <li>Werewolf: sees other werewolves. If alone, may peek one center card.</li>
                    <li>Minion: learns who the werewolves are.</li>
                    <li>Mason: learns the other mason(s).</li>
                    <li>Seer: may view one player’s role or two center cards.</li>
                    <li>Robber: swaps roles with another player and learns their new role.</li>
                    <li>Drunk: swaps with a center card without seeing the new role.</li>
                    <li>Troublemaker: swaps roles between two other players.</li>
                    <li>Insomniac: learns their final role at end of night.</li>
                    <li>Doppleganger: copies another player’s role and acts immediately, except if
                      copying Insomniac (acts at end).</li>
                    <li>Tanner: wins alone if eliminated.</li>
                    <li>Villager: no night action.</li>
                  </ul>
                </div>
                <div className="modal-section">
                  <h4>Win conditions</h4>
                  <ul className="modal-list">
                    <li>Village wins if at least one werewolf is eliminated.</li>
                    <li>Werewolves win if no werewolf is eliminated.</li>
                    <li>Tanner wins alone if eliminated.</li>
                  </ul>
                </div>
                <div className="modal-section">
                  <h4>Tokens</h4>
                  <p className="lede">Public suspicion tokens are visible to everyone.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
