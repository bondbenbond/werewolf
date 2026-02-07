import "./index.css";
import { useEffect, useState } from "react";
import { ApiProvider } from "./api/ApiContext";
import { loadApiEnv, type ApiEnv } from "./api/env";
import { Playground } from "./playground/Playground";
import { HomeScreen } from "./screens/HomeScreen";
import { JoinGameScreen } from "./screens/JoinGameScreen";
import {
  clearStoredSession,
  readSessionFromUrl,
  readStoredSession,
  type SessionInfo,
} from "./api/session";

export default function App() {
  const url = new URL(window.location.href);
  const gameFromUrl = url.searchParams.get("game");
  const devMode = url.searchParams.get("dev") === "1";
  const urlSession = readSessionFromUrl();
  const storedSession = readStoredSession();
  const matchedStoredSession =
    gameFromUrl && storedSession?.gameId === gameFromUrl ? storedSession : null;
  const [env, setEnv] = useState<ApiEnv | null>(null);
  const [envError, setEnvError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(() => urlSession ?? matchedStoredSession);
  const [resumeSession, setResumeSession] = useState<SessionInfo | null>(() =>
    urlSession || gameFromUrl ? null : storedSession
  );

  useEffect(() => {
    let mounted = true;
    loadApiEnv()
      .then((loaded) => {
        if (mounted) {
          setEnv(loaded);
        }
      })
      .catch((error: Error) => {
        if (mounted) {
          setEnvError(error.message);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (envError) {
    return <div className="app-loading">Failed to load env.json: {envError}</div>;
  }

  if (!env) {
    return (
      <div className="app-loading">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  return (
    <ApiProvider env={env}>
      {devMode || session ? (
        <Playground />
      ) : gameFromUrl ? (
        <JoinGameScreen gameId={gameFromUrl} onSession={setSession} />
      ) : (
        <HomeScreen
          onSession={setSession}
          resumeSession={resumeSession}
          onResumeSession={(next) => {
            setSession(next);
            setResumeSession(null);
          }}
          onDismissResume={() => {
            clearStoredSession();
            setResumeSession(null);
          }}
        />
      )}
    </ApiProvider>
  );
}
