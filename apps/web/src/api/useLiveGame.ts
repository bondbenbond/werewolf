import { useCallback, useEffect, useRef, useState } from "react";
import { useApiEnv } from "./ApiContext";

type SnapshotResponse = {
  version: number;
  state: PublicGameState;
  private?: PrivateView;
};

type EventBatch = {
  fromVersion: number;
  toVersion: number;
  events: Array<{ version: number }>;
};

export type PublicGameState = {
  phase: string;
  phaseEndsAt?: number;
  gameName?: string;
  maxPlayers: number;
  hostPlayerId: string;
  players: Array<{ playerId: string; name: string; connected: boolean; ready: boolean }>;
  roleSelection: string[];
  settings: {
    nightStepSeconds: number;
    parallelResultSeconds: number;
    discussionSeconds: number;
    votingSeconds: number;
    allowVoteChanges: boolean;
    anonymousVotes: boolean;
    showActionLogOnReveal: boolean;
    tokensEnabled: boolean;
    autoAdvanceNight: boolean;
    parallelNight: boolean;
  };
  tokenPoolByRole?: Record<string, number>;
  dealAcks?: Record<string, boolean>;
  night?: {
    stepRole: string | null;
    nextStepRole?: string | null;
    completedThisStep: Record<string, boolean>;
    stepIndex: number;
    totalSteps: number;
    endsAt?: number;
    mode?: "sequential" | "parallel";
    copiedRoleByPlayer?: Record<string, string | null>;
    dopplegangerInsomniacStep?: boolean;
  };
  tokens?: {
    tokensByPlayer: Record<string, Record<string, number>>;
    suspectRolesByPlayer: Record<string, Record<string, string>>;
  };
  voting?: {
    locked: boolean;
    tally?: Record<string, number>;
  };
  reveal?: {
    eliminatedPlayerIds: string[];
    winners?: string;
    finalRoles?: Record<string, string>;
    centerRoles?: string[];
    originalRoles?: Record<string, string>;
  };
};

export type PrivateView =
  | { kind: "none" }
  | { kind: "yourOriginalRole"; role: string }
  | { kind: "dopplegangerCopiedRole"; role: string; targetPlayerId: string }
  | { kind: "dopplegangerActAsRole"; role: string; targetPlayerId: string }
  | { kind: "minionSawWerewolves"; werewolfIds: string[]; targetPlayerId?: string }
  | { kind: "masonSawMasons"; masonIds: string[] }
  | { kind: "werewolfSawWerewolves"; werewolfIds: string[] }
  | { kind: "werewolfSoloStatus"; isSolo: boolean }
  | { kind: "werewolfSoloPeek"; centerIndex: number; role: string }
  | { kind: "seerViewPlayer"; targetPlayerId: string; role: string }
  | { kind: "seerViewCenter"; center: Array<{ centerIndex: number; role: string }> }
  | { kind: "robberNewRole"; role: string }
  | { kind: "drunkSwapped"; centerIndex: number }
  | { kind: "troublemakerSwapped"; targetPlayerIds: [string, string] }
  | { kind: "insomniacFinalRole"; role: string };

type LiveGameOptions = {
  enabled: boolean;
  gameId: string;
  playerId?: string;
  secret?: string;
};

type LiveGameState = {
  status: "idle" | "loading" | "connected" | "error";
  error?: string;
  snapshot?: SnapshotResponse;
  version?: number;
};

const parseEvent = (event: MessageEvent) => {
  try {
    return JSON.parse(event.data) as { version?: number };
  } catch {
    return null;
  }
};

export function useLiveGame({ enabled, gameId, playerId, secret }: LiveGameOptions): LiveGameState {
  const { serverBaseUrl } = useApiEnv();
  const [state, setState] = useState<LiveGameState>({ status: "idle" });
  const lastVersionRef = useRef(0);
  const lastSnapshotAtRef = useRef(0);
  const lastSnapshotVersionRef = useRef(0);
  const forceSnapshotRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const hiddenPollTimerRef = useRef<number | null>(null);

  const snapshotUrl = useCallback(() => {
    const url = new URL(`/games/${gameId}/snapshot`, serverBaseUrl);
    if (playerId && secret) {
      url.searchParams.set("playerId", playerId);
      url.searchParams.set("secret", secret);
    }
    return url.toString();
  }, [gameId, playerId, secret, serverBaseUrl]);

  const eventsUrl = useCallback(
    (since: number) => {
      const url = new URL(`/games/${gameId}/events`, serverBaseUrl);
      url.searchParams.set("since", String(since));
      return url.toString();
    },
    [gameId, serverBaseUrl]
  );

  const streamUrl = useCallback(
    (since: number) => {
      const url = new URL(`/games/${gameId}/stream`, serverBaseUrl);
      url.searchParams.set("since", String(since));
      if (playerId && secret) {
        url.searchParams.set("playerId", playerId);
        url.searchParams.set("secret", secret);
      }
      return url.toString();
    },
    [gameId, playerId, secret, serverBaseUrl]
  );

  const fetchSnapshot = useCallback(async () => {
    const response = await fetch(snapshotUrl());
    if (!response.ok) {
      throw new Error(`Snapshot failed (${response.status})`);
    }
    const snapshot = (await response.json()) as SnapshotResponse;
    lastVersionRef.current = snapshot.version;
    lastSnapshotAtRef.current = Date.now();
    lastSnapshotVersionRef.current = snapshot.version;
    setState((prev) => ({
      ...prev,
      status: prev.status === "idle" ? "loading" : prev.status,
      snapshot,
      version: snapshot.version,
      error: undefined,
    }));
  }, [snapshotUrl]);

  const fetchEvents = useCallback(
    async (since: number): Promise<EventBatch | null> => {
      const response = await fetch(eventsUrl(since));
      if (response.status === 410) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Events failed (${response.status})`);
      }
      return (await response.json()) as EventBatch;
    },
    [eventsUrl]
  );

  useEffect(() => {
    if (!enabled || !gameId) {
      setState({ status: "idle" });
      return undefined;
    }

    let active = true;
    let source: EventSource | null = null;
    let connecting = false;

    const closeSource = () => {
      if (source) {
        source.close();
        source = null;
      }
    };
    const clearHiddenPoll = () => {
      if (hiddenPollTimerRef.current !== null) {
        window.clearInterval(hiddenPollTimerRef.current);
        hiddenPollTimerRef.current = null;
      }
    };
    const clearReconnect = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
    const startHiddenPoll = () => {
      if (hiddenPollTimerRef.current !== null) return;
      hiddenPollTimerRef.current = window.setInterval(async () => {
        if (!active) return;
        try {
          await fetchSnapshot();
          setState((prev) => ({ ...prev, status: "connected", error: undefined }));
        } catch (error) {
          if (!active) return;
          setState((prev) => ({
            ...prev,
            status: "error",
            error: (error as Error).message,
          }));
        }
      }, 2000);
    };

    const scheduleRefresh = () => {
      if (refreshTimerRef.current !== null) return;
      refreshTimerRef.current = window.setTimeout(async () => {
        refreshTimerRef.current = null;
        try {
          const events = await fetchEvents(lastSnapshotVersionRef.current);
          if (!events) {
            await fetchSnapshot();
            return;
          }
          if (events.toVersion > lastVersionRef.current) {
            lastVersionRef.current = events.toVersion;
          }
          if (forceSnapshotRef.current) {
            forceSnapshotRef.current = false;
            await fetchSnapshot();
            return;
          }
          // If server version moved, refresh snapshot even when the visible event
          // batch is empty (e.g. filtered/private-only or missed stream timing).
          if (events.toVersion > lastSnapshotVersionRef.current) {
            await fetchSnapshot();
            return;
          }
          if (events.events.length > 0) {
            await fetchSnapshot();
          }
        } catch (error) {
          if (active) {
            setState((prev) => ({
              ...prev,
              status: "error",
              error: (error as Error).message,
            }));
          }
        }
      }, 500);
    };

    const connect = async () => {
      if (connecting) return;
      connecting = true;
      setState((prev) => ({ ...prev, status: "loading", error: undefined }));
      try {
        await fetchSnapshot();
      } catch (error) {
        if (active) {
          setState({ status: "error", error: (error as Error).message });
        }
        connecting = false;
        return;
      }

      if (!active) {
        connecting = false;
        return;
      }

      if (document.hidden) {
        setState((prev) => ({ ...prev, status: "connected", error: undefined }));
        startHiddenPoll();
        connecting = false;
        return;
      }

      clearHiddenPoll();
      source = new EventSource(streamUrl(lastVersionRef.current));
      source.onopen = () => {
        if (active) {
          setState((prev) => ({ ...prev, status: "connected" }));
        }
      };
      const handleEvent = (event: MessageEvent, isPrivate: boolean) => {
        const parsed = parseEvent(event);
        if (parsed?.version && parsed.version > lastVersionRef.current) {
          lastVersionRef.current = parsed.version;
        }
        if (parsed?.version) {
          setState((prev) => ({
            ...prev,
            version: Math.max(prev.version ?? 0, parsed.version ?? 0),
          }));
        }
        if (isPrivate) {
          forceSnapshotRef.current = true;
        }
        scheduleRefresh();
      };
      source.addEventListener("public", (event) => handleEvent(event, false));
      source.addEventListener("private", (event) => handleEvent(event, true));
      source.onerror = () => {
        closeSource();
        if (!active) return;
        if (document.hidden) {
          setState((prev) => ({ ...prev, status: "connected", error: undefined }));
          startHiddenPoll();
          return;
        }
        setState((prev) => ({ ...prev, status: "error", error: "Stream disconnected" }));
        if (reconnectTimerRef.current === null) {
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, 1500);
        }
      };
      connecting = false;
    };

    const handleVisibilityChange = () => {
      if (!active) return;
      if (document.hidden) {
        closeSource();
        clearReconnect();
        startHiddenPoll();
        return;
      }
      clearHiddenPoll();
      void connect();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    connect();

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      closeSource();
      clearHiddenPoll();
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      clearReconnect();
    };
  }, [enabled, fetchSnapshot, gameId, streamUrl]);

  return state;
}
