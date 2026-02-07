import type { ApiEnv } from "./env";

export type CreateGameResponse = {
  gameId: string;
  host: { playerId: string; name: string; secret: string };
  version: number;
};

export type JoinGameResponse = {
  playerId: string;
  name: string;
  secret: string;
  version: number;
};

export type Command = {
  type: string;
  payload?: Record<string, unknown>;
};

export type CommandEnvelope = {
  playerId: string;
  secret: string;
  lastKnownVersion: number;
  command: Command;
};

export type CommandResponse = {
  accepted: boolean;
  appliedVersion: number;
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const parseResponseError = async (response: Response): Promise<ApiError> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      return new ApiError(
        payload.message || payload.error || `Request failed (${response.status})`,
        response.status,
        payload.error
      );
    } catch {
      return new ApiError(`Request failed (${response.status})`, response.status);
    }
  }

  const text = await response.text();
  return new ApiError(text || `Request failed (${response.status})`, response.status);
};

const handleJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw await parseResponseError(response);
  }
  return (await response.json()) as T;
};

const parseErrorJson = async (response: Response) => {
  try {
    return (await response.json()) as {
      error?: string;
      message?: string;
      serverVersion?: number;
    };
  } catch {
    return null;
  }
};

export const createGame = async (env: ApiEnv, hostName: string): Promise<CreateGameResponse> => {
  const response = await fetch(`${env.serverBaseUrl}/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostName }),
  });
  return handleJson<CreateGameResponse>(response);
};

export const joinGame = async (
  env: ApiEnv,
  gameId: string,
  name: string
): Promise<JoinGameResponse> => {
  const response = await fetch(`${env.serverBaseUrl}/games/${gameId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return handleJson<JoinGameResponse>(response);
};

export const sendCommand = async (
  env: ApiEnv,
  gameId: string,
  envelope: CommandEnvelope
): Promise<CommandResponse> => {
  const doRequest = async (payload: CommandEnvelope) => {
    const response = await fetch(`${env.serverBaseUrl}/games/${gameId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      return handleJson<CommandResponse>(response);
    }
    if (response.status === 409) {
      const error = await parseErrorJson(response);
      if (error?.error === "VERSION_MISMATCH" && typeof error.serverVersion === "number") {
        return doRequest({ ...payload, lastKnownVersion: error.serverVersion });
      }
      throw new ApiError(error?.message || "Version mismatch", response.status, error?.error);
    }
    throw await parseResponseError(response);
  };

  return doRequest(envelope);
};

export const deleteGame = async (
  env: ApiEnv,
  gameId: string,
  playerId: string,
  secret: string
): Promise<void> => {
  const response = await fetch(`${env.serverBaseUrl}/games/${gameId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, secret }),
  });
  if (!response.ok) {
    throw await parseResponseError(response);
  }
};
