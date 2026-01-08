// Shared types and constants for the One-Night social deduction game

export type Phase =
  | "lobby"
  | "deal"
  | "night"
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
  "minion",
  "werewolf",
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
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  discussionSeconds: 300,
  allowVoteChanges: true,
  anonymousVotes: true,
  showActionLogOnReveal: false,
  tokensEnabled: true,
  tokensPerPlayerLimit: 3,
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
  stepRole: Role;
  totalSteps: number;
  completionByPlayer: Record<string, boolean>;
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
  eliminatedPlayerId?: string;
  winners: Winners;
  finalRolesByPlayer: Record<string, Role>;
  centerRoles: [Role, Role, Role];
  actionLog?: NightActionLogEntry[];
};

export type GameState = {
  roomCode: string;
  gameName?: string;
  phase: Phase;
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

export const computeElimination = (tally: Record<string, number>): string | undefined => {
  let eliminated: string | undefined;
  let topVotes = 0;
  let tied = false;

  Object.entries(tally).forEach(([target, votes]) => {
    if (votes > topVotes) {
      eliminated = target;
      topVotes = votes;
      tied = false;
    } else if (votes === topVotes) {
      tied = true;
    }
  });

  if (tied) return undefined; // Option A: tie means no elimination
  return eliminated;
};

export const computeWinners = (state: GameState, eliminatedPlayerId?: string): Winners => {
  const roles = state.roles?.currentRolesByPlayer ?? {};
  const werewolves = Object.entries(roles)
    .filter(([, role]) => role === "werewolf")
    .map(([id]) => id);

  if (eliminatedPlayerId && roles[eliminatedPlayerId] === "werewolf") {
    return "village";
  }

  if (werewolves.length === 0) {
    return "village";
  }

  return "werewolves";
};
