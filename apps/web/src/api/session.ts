export type SessionInfo = {
  gameId: string;
  playerId: string;
  secret: string;
  name: string;
  isHost: boolean;
};

const SESSION_KEY = "werewolf.session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type StoredSession = {
  session: SessionInfo;
  savedAt: number;
};

const parseStoredSession = (raw: string): StoredSession | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession & SessionInfo>;
    if (
      parsed &&
      typeof parsed === "object" &&
      "session" in parsed &&
      parsed.session &&
      typeof parsed.savedAt === "number"
    ) {
      return parsed as StoredSession;
    }
    if (
      typeof parsed?.gameId === "string" &&
      typeof parsed?.playerId === "string" &&
      typeof parsed?.secret === "string" &&
      typeof parsed?.name === "string" &&
      typeof parsed?.isHost === "boolean"
    ) {
      return {
        session: parsed as SessionInfo,
        savedAt: Date.now(),
      };
    }
  } catch {
    return null;
  }
  return null;
};

const clearStorageOnly = () => {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
};

const readFromStorage = (): StoredSession | null => {
  const sessionRaw = sessionStorage.getItem(SESSION_KEY);
  if (sessionRaw) {
    const parsed = parseStoredSession(sessionRaw);
    if (!parsed) {
      clearStorageOnly();
      return null;
    }
    if (Date.now() - parsed.savedAt > SESSION_TTL_MS) {
      clearStorageOnly();
      return null;
    }
    return parsed;
  }

  const legacyRaw = localStorage.getItem(SESSION_KEY);
  if (!legacyRaw) return null;
  const legacyParsed = parseStoredSession(legacyRaw);
  if (!legacyParsed) {
    clearStorageOnly();
    return null;
  }
  if (Date.now() - legacyParsed.savedAt > SESSION_TTL_MS) {
    clearStorageOnly();
    return null;
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(legacyParsed));
  localStorage.removeItem(SESSION_KEY);
  return legacyParsed;
};

export const persistSession = (session: SessionInfo) => {
  const stored: StoredSession = {
    session,
    savedAt: Date.now(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  localStorage.removeItem(SESSION_KEY);
  const url = new URL(window.location.href);
  url.searchParams.set("game", session.gameId);
  url.searchParams.delete("playerId");
  url.searchParams.delete("secret");
  window.history.replaceState({}, "", url.toString());
};

export const readSessionFromUrl = (): SessionInfo | null => {
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
  return null;
};

export const readStoredSession = (): SessionInfo | null => {
  const stored = readFromStorage();
  return stored?.session ?? null;
};

export const readSession = (): SessionInfo | null => {
  return readSessionFromUrl() ?? readStoredSession();
};

export const clearStoredSession = () => {
  clearStorageOnly();
};

export const clearSession = () => {
  clearStorageOnly();
  const url = new URL(window.location.href);
  url.searchParams.delete("game");
  url.searchParams.delete("playerId");
  url.searchParams.delete("secret");
  window.history.replaceState({}, "", url.toString());
};
