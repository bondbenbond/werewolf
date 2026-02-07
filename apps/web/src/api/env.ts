export type ApiEnv = {
  serverBaseUrl: string;
};

let cachedEnv: ApiEnv | null = null;

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

export async function loadApiEnv(): Promise<ApiEnv> {
  if (cachedEnv) {
    return cachedEnv;
  }

  const response = await fetch("/assets/env.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load env.json (${response.status})`);
  }

  const data = (await response.json()) as Partial<ApiEnv>;
  if (!data.serverBaseUrl) {
    throw new Error("env.json is missing serverBaseUrl");
  }

  cachedEnv = {
    serverBaseUrl: normalizeBaseUrl(data.serverBaseUrl),
  };
  return cachedEnv;
}
