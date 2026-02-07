import { useState } from "react";
import { useApiEnv } from "../api/ApiContext";
import { ApiError, joinGame } from "../api/client";
import { persistSession, type SessionInfo } from "../api/session";
import { Button } from "../components/Button";

type JoinGameScreenProps = {
  gameId: string;
  onSession?: (session: SessionInfo) => void;
};

export function JoinGameScreen({ gameId, onSession }: JoinGameScreenProps) {
  const env = useApiEnv();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleJoin = async () => {
    if (submitting) return;
    if (!name.trim()) {
      setError("Enter your name to join.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await joinGame(env, gameId, name.trim());
      const session: SessionInfo = {
        gameId,
        playerId: response.playerId,
        secret: response.secret,
        name: response.name,
        isHost: false,
      };
      persistSession(session);
      onSession?.(session);
    } catch (err) {
      if (err instanceof ApiError && err.code === "GAME_NOT_FOUND") {
        setError(`Game ${gameId} does not exist. Check the code and try again.`);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="home-wrap">
      <div className="home-header">
        <p className="eyebrow">Join a game</p>
        <h2>Room {gameId}</h2>
        <p className="lede">Enter your name to join this room.</p>
      </div>

      <div className="home-global-inputs">
        <div className="field">
          <label htmlFor="join-name">Your name</label>
          <input
            id="join-name"
            className={`input ${error ? "input-error" : ""}`}
            placeholder="Enter your name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
          />
          {error ? (
            <p className="micro error-text" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <div className="home-actions">
        <Button variant="success" onClick={handleJoin}>
          Join
        </Button>
      </div>
    </div>
  );
}
