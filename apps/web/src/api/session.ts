export type SessionInfo = {
  gameId: string;
  playerId: string;
  secret: string;
  name: string;
  isHost: boolean;
};

const SESSION_KEY = "werewolf.session";

export const persistSession = (session: SessionInfo) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  const url = new URL(window.location.href);
  url.searchParams.set("game", session.gameId);
  url.searchParams.set("playerId", session.playerId);
  url.searchParams.set("secret", session.secret);
  window.history.replaceState({}, "", url.toString());
};

export const readSession = (): SessionInfo | null => {
  const url = new URL(window.location.href);
  const gameId = url.searchParams.get("game");
  const playerId = url.searchParams.get("playerId");
  const secret = url.searchParams.get("secret");
  if (gameId && playerId && secret) {
    return {
      gameId,
      playerId,
      secret,
      name: "Player",
      isHost: false,
    };
  }

  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as SessionInfo;
  } catch {
    return null;
  }
};

export const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
  const url = new URL(window.location.href);
  url.searchParams.delete("game");
  url.searchParams.delete("playerId");
  url.searchParams.delete("secret");
  window.history.replaceState({}, "", url.toString());
};
