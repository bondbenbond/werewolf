import { createContext, useContext } from "react";
import type { ApiEnv } from "./env";

const ApiContext = createContext<ApiEnv | null>(null);

export function ApiProvider({ env, children }: { env: ApiEnv; children: React.ReactNode }) {
  return <ApiContext.Provider value={env}>{children}</ApiContext.Provider>;
}

export function useApiEnv() {
  const env = useContext(ApiContext);
  if (!env) {
    throw new Error("ApiProvider is missing");
  }
  return env;
}
