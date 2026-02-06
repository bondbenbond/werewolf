import { useRef, useState } from "react";

export function HomeScreen() {
  const [playerName, setPlayerName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [pin, setPin] = useState<string[]>(Array.from({ length: 6 }, () => ""));
  const [modal, setModal] = useState<"how" | "rules" | null>(null);
  const closeModal = () => setModal(null);
  const pinRefs = useRef<Array<HTMLInputElement | null>>([]);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const setPinDigit = (index: number, value: string) => {
    const next = [...pin];
    next[index] = value;
    setPin(next);
  };
  const handlePinChange = (index: number, value: string) => {
    const digit = value.replace(/[^0-9]/g, "").slice(0, 1);
    setPinDigit(index, digit);
    if (digit && pinRefs.current[index + 1]) {
      pinRefs.current[index + 1]?.focus();
    }
    if (digit && index === pin.length - 1) {
      // Join action would trigger here once wired to API.
    }
  };
  const handlePinKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (/^[0-9]$/.test(event.key)) {
      setPinDigit(index, event.key);
      if (pinRefs.current[index + 1]) {
        pinRefs.current[index + 1]?.focus();
      }
      event.preventDefault();
      return;
    }
    if (event.key === "Backspace" && !pin[index] && pinRefs.current[index - 1]) {
      pinRefs.current[index - 1]?.focus();
    }
  };
  const handlePinPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text").replace(/[^0-9]/g, "");
    if (!text) return;
    const next = Array.from({ length: 6 }, (_, idx) => text[idx] ?? "");
    setPin(next);
    const nextIndex = Math.min(text.length, 6) - 1;
    if (nextIndex >= 0) {
      pinRefs.current[nextIndex]?.focus();
    }
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

  return (
    <div className="home-wrap">
      <div className="home-header">
        <p className="eyebrow">One-night social deduction</p>
        <h2>One Night Ultimate Werewolf</h2>
        <p className="lede">Host in minutes or jump in with a room code.</p>
      </div>

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
            }}
          />
          {nameError ? (
            <p className="micro error-text" role="alert">
              Name is required to continue.
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
            requireName();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              requireName();
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
