// Shared types and constants for the One-Night social deduction game

export type Phase =
  | "lobby"
  | "deal"
  | "nightCountdown"
  | "night"
  | "parallelResult"
  | "discussion"
  | "voting"
  | "reveal";

export type Role =
  | "villager"
  | "werewolf"
  | "minion"
  | "mason"
  | "seer"
  | "robber"
  | "troublemaker"
  | "insomniac";

export type CenterIndex = 0 | 1 | 2;

export const NIGHT_ORDER: Role[] = [
  "werewolf",
  "minion",
  "mason",
  "seer",
  "robber",
  "troublemaker",
  "insomniac",
];

export type Player = {
  playerId: string;
  name: string;
  connected: boolean;
  socketId?: string;
  ready: boolean;
  resumeSecret: string;
  ackedRole?: boolean;
  voteTargetPlayerId?: string | null;
};

export type GameSettings = {
  discussionSeconds: number;
  allowVoteChanges: boolean;
  anonymousVotes: boolean;
  showActionLogOnReveal: boolean;
  tokensEnabled: boolean;
  tokensPerPlayerLimit: number;
  autoAdvanceNight: boolean;
  parallelNight: boolean;
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  discussionSeconds: 300,
  allowVoteChanges: true,
  anonymousVotes: true,
  showActionLogOnReveal: false,
  tokensEnabled: true,
  tokensPerPlayerLimit: 3,
  autoAdvanceNight: true,
  parallelNight: false,
};

export type RoleSelection = {
  roles: Role[]; // players + 3
};

export type TokensState = {
  // tokensByPlayer[ownerId][targetId] = count
  tokensByPlayer: Record<string, Record<string, number>>;
  // suspectRolesByPlayer[ownerId][targetId] = role label
  suspectRolesByPlayer: Record<string, Record<string, Role>>;
};

export const createEmptyTokensState = (): TokensState => ({
  tokensByPlayer: {},
  suspectRolesByPlayer: {},
});

export type VotingState = {
  locked: boolean;
  votesByPlayer: Record<string, string | null>;
};

export const createEmptyVotingState = (): VotingState => ({
  locked: false,
  votesByPlayer: {},
});

export type DealState = {
  ackByPlayer: Record<string, boolean>;
};

export type NightActionLogEntry =
  | { kind: "minionSawWerewolves"; playerId: string; saw: string[] }
  | { kind: "werewolfSawWerewolves"; playerId: string; saw: string[] }
  | { kind: "werewolfSoloPeek"; playerId: string; centerIndex: CenterIndex; role: Role }
  | { kind: "masonSawMasons"; playerId: string; saw: string[] }
  | { kind: "seerViewPlayer"; playerId: string; targetPlayerId: string; role: Role }
  | { kind: "seerViewCenter"; playerId: string; center: Array<{ centerIndex: CenterIndex; role: Role }> }
  | { kind: "robberSwap"; playerId: string; targetPlayerId: string; newRole: Role }
  | { kind: "troublemakerSwap"; playerId: string; targets: [string, string] }
  | { kind: "insomniacPeek"; playerId: string; finalRole: Role };

export type NightState = {
  stepIndex: number;
  stepRole: Role | null;
  totalSteps: number;
  completionByPlayer: Record<string, boolean>;
  endsAt?: number;
  mode?: "sequential" | "parallel";
  actionLog?: NightActionLogEntry[];
};

export type RolesState = {
  originalRolesByPlayer: Record<string, Role>;
  currentRolesByPlayer: Record<string, Role>;
  centerRoles: [Role, Role, Role];
};

export type Winners = "village" | "werewolves";

export type RevealState = {
  tally: Record<string, number>;
  eliminatedPlayerIds: string[];
  winners: Winners;
  finalRolesByPlayer: Record<string, Role>;
  centerRoles: [Role, Role, Role];
  actionLog?: NightActionLogEntry[];
};

export type GameState = {
  roomCode: string;
  gameName?: string;
  phase: Phase;
  phaseEndsAt?: number;
  hostPlayerId: string;
  maxPlayers: number;
  playersById: Record<string, Player>;
  playerOrder: string[];
  settings: GameSettings;
  roleSelection: RoleSelection;
  deal?: DealState;
  roles?: RolesState;
  night?: NightState;
  tokens?: TokensState;
  voting?: VotingState;
  reveal?: RevealState;
  createdAt: number;
  updatedAt: number;
};

export type PrivateView =
  | { kind: "none" }
  | { kind: "yourOriginalRole"; role: Role }
  | { kind: "minionSawWerewolves"; werewolfIds: string[] }
  | { kind: "masonSawMasons"; masonIds: string[] }
  | { kind: "werewolfSawWerewolves"; werewolfIds: string[] }
  | { kind: "werewolfSoloStatus"; isSolo: boolean }
  | { kind: "werewolfSoloPeek"; centerIndex: CenterIndex; role: Role }
  | { kind: "seerViewPlayer"; targetPlayerId: string; role: Role }
  | { kind: "seerViewCenter"; center: Array<{ centerIndex: CenterIndex; role: Role }> }
  | { kind: "robberNewRole"; role: Role }
  | { kind: "insomniacFinalRole"; role: Role };

export const now = (): number => Date.now();

// Utility helpers shared by server and client

export const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const getPlayers = (state: GameState): Player[] =>
  state.playerOrder.map((id) => state.playersById[id]).filter(Boolean);

export const getPlayer = (state: GameState, playerId: string): Player | undefined =>
  state.playersById[playerId];

export const isHost = (state: GameState, playerId: string): boolean =>
  state.hostPlayerId === playerId;

export const isPhase = (state: GameState, phase: Phase): boolean => state.phase === phase;

export const getOriginalRole = (state: GameState, playerId: string): Role | undefined =>
  state.roles?.originalRolesByPlayer[playerId];

export const getCurrentRole = (state: GameState, playerId: string): Role | undefined =>
  state.roles?.currentRolesByPlayer[playerId];

export const eligiblePlayersForNightRole = (state: GameState, role: Role): string[] => {
  if (!state.roles) return [];
  return Object.entries(state.roles.originalRolesByPlayer)
    .filter(([, originalRole]) => originalRole === role)
    .map(([playerId]) => playerId);
};

export const isPlayerAloneWerewolf = (state: GameState, playerId: string): boolean => {
  if (!state.roles) return false;
  const allWerewolves = eligiblePlayersForNightRole(state, "werewolf");
  return allWerewolves.length === 1 && allWerewolves[0] === playerId;
};

export const applyRobberSwap = (
  state: GameState,
  robberId: string,
  targetId: string
): Role | undefined => {
  const roles = state.roles;
  if (!roles) return undefined;
  const targetRole = roles.currentRolesByPlayer[targetId];
  const robberRole = roles.currentRolesByPlayer[robberId];
  roles.currentRolesByPlayer[targetId] = robberRole;
  roles.currentRolesByPlayer[robberId] = targetRole;
  return targetRole;
};

export const applyTroublemakerSwap = (
  state: GameState,
  firstId: string,
  secondId: string
): void => {
  const roles = state.roles;
  if (!roles) return;
  const aRole = roles.currentRolesByPlayer[firstId];
  roles.currentRolesByPlayer[firstId] = roles.currentRolesByPlayer[secondId];
  roles.currentRolesByPlayer[secondId] = aRole;
};

export const computeVoteTally = (state: GameState): Record<string, number> => {
  const tally: Record<string, number> = {};
  const votes = state.voting?.votesByPlayer ?? {};
  Object.values(votes).forEach((target) => {
    if (!target) return;
    tally[target] = (tally[target] ?? 0) + 1;
  });
  return tally;
};

export const computeEliminations = (tally: Record<string, number>): string[] => {
  let topVotes = 0;
  Object.values(tally).forEach((votes) => {
    if (votes > topVotes) topVotes = votes;
  });
  if (topVotes === 0) return [];
  return Object.entries(tally)
    .filter(([, votes]) => votes === topVotes)
    .map(([playerId]) => playerId);
};

export const computeWinners = (state: GameState, eliminatedPlayerIds: string[]): Winners => {
  const roles = state.roles?.currentRolesByPlayer ?? {};
  const werewolves = Object.entries(roles)
    .filter(([, role]) => role === "werewolf")
    .map(([id]) => id);

  if (eliminatedPlayerIds.some((id) => roles[id] === "werewolf")) {
    return "village";
  }

  if (werewolves.length === 0) {
    return "village";
  }

  return "werewolves";
};
