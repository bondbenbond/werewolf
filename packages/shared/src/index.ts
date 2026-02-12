// Shared types for the One-Night social deduction game (rewrite baseline)

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
  | "doppleganger"
  | "seer"
  | "robber"
  | "drunk"
  | "troublemaker"
  | "insomniac"
  | "tanner";

export type CenterIndex = 0 | 1 | 2;

export const NIGHT_ORDER: Role[] = [
  "doppleganger",
  "werewolf",
  "minion",
  "mason",
  "seer",
  "robber",
  "drunk",
  "troublemaker",
  "insomniac",
];

export type Player = {
  playerId: string;
  name: string;
  connected: boolean;
  ready: boolean;
};

export type GameSettings = {
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

export type RoleSelection = {
  roles: Role[]; // players + 3
};

export type TokensState = {
  // tokensByPlayer[ownerId][targetId] = count
  tokensByPlayer: Record<string, Record<string, number>>;
  // suspectRolesByPlayer[ownerId][targetId] = role label
  suspectRolesByPlayer: Record<string, Record<string, Role>>;
  // tokenPoolByRole[role] = count
  tokenPoolByRole: Record<Role, number>;
};

export type VotingState = {
  locked: boolean;
  votesByPlayer: Record<string, string | null>;
};

export type DealState = {
  ackByPlayer: Record<string, boolean>;
};

export type NightActionLogEntry =
  | { kind: "dopplegangerCopiedRole"; playerId: string; role: Role }
  | { kind: "minionSawWerewolves"; playerId: string; saw: string[] }
  | { kind: "werewolfSawWerewolves"; playerId: string; saw: string[] }
  | { kind: "werewolfSoloPeek"; playerId: string; centerIndex: CenterIndex; role: Role }
  | { kind: "masonSawMasons"; playerId: string; saw: string[] }
  | { kind: "seerViewPlayer"; playerId: string; targetPlayerId: string; role: Role }
  | { kind: "seerViewCenter"; playerId: string; center: Array<{ centerIndex: CenterIndex; role: Role }> }
  | { kind: "robberSwap"; playerId: string; targetPlayerId: string; newRole: Role }
  | { kind: "drunkSwap"; playerId: string; centerIndex: CenterIndex }
  | { kind: "troublemakerSwap"; playerId: string; targets: [string, string] }
  | { kind: "insomniacPeek"; playerId: string; finalRole: Role };

export type NightState = {
  stepIndex: number;
  stepRole: Role | null;
  totalSteps: number;
  completionByPlayer: Record<string, boolean>;
  copiedRoleByPlayer?: Record<string, Role | null>;
  dopplegangerInsomniacStep?: boolean;
  endsAt?: number;
  mode?: "sequential" | "parallel";
  actionLog?: NightActionLogEntry[];
};

export type RolesState = {
  originalRolesByPlayer: Record<string, Role>;
  currentRolesByPlayer: Record<string, Role>;
  centerRoles: [Role, Role, Role];
};

export type Winners = "village" | "werewolves" | "tanner";

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
  | { kind: "dopplegangerCopiedRole"; role: Role; targetPlayerId: string }
  | { kind: "dopplegangerActAsRole"; role: Role; targetPlayerId: string }
  | { kind: "minionSawWerewolves"; werewolfIds: string[]; targetPlayerId?: string }
  | { kind: "masonSawMasons"; masonIds: string[] }
  | { kind: "werewolfSawWerewolves"; werewolfIds: string[] }
  | { kind: "werewolfSoloStatus"; isSolo: boolean }
  | { kind: "werewolfSoloPeek"; centerIndex: CenterIndex; role: Role }
  | { kind: "seerViewPlayer"; targetPlayerId: string; role: Role }
  | { kind: "seerViewCenter"; center: Array<{ centerIndex: CenterIndex; role: Role }> }
  | { kind: "robberNewRole"; role: Role }
  | { kind: "drunkSwapped"; centerIndex: CenterIndex }
  | { kind: "troublemakerSwapped"; targetPlayerIds: [string, string] }
  | { kind: "insomniacFinalRole"; role: Role };

// Public state for UI consumption

export type PublicPlayer = {
  playerId: string;
  name: string;
  connected: boolean;
  ready: boolean;
  hasVoted?: boolean;
};

export type PublicNightState = {
  stepRole: Role | null;
  nextStepRole?: Role | null;
  completedThisStep: Record<string, boolean>;
  stepIndex: number;
  totalSteps: number;
  endsAt?: number;
  mode?: "sequential" | "parallel";
  copiedRoleByPlayer?: Record<string, Role | null>;
  dopplegangerInsomniacStep?: boolean;
};

export type PublicTokensState = {
  tokensByPlayer: Record<string, Record<string, number>>;
  suspectRolesByPlayer: Record<string, Record<string, Role>>;
};

export type PublicVotingState = {
  locked: boolean;
  tally?: Record<string, number>;
};

export type PublicRevealState = {
  eliminatedPlayerIds: string[];
  winners?: Winners;
  finalRoles?: Record<string, Role>;
  centerRoles?: Role[];
  originalRoles?: Record<string, Role>;
};

export type PublicGameState = {
  phase: Phase;
  phaseEndsAt?: number;
  gameName?: string;
  maxPlayers: number;
  hostPlayerId: string;
  players: PublicPlayer[];
  roleSelection: Role[];
  settings: GameSettings;
  tokenPoolByRole?: Record<Role, number>;
  dealAcks?: Record<string, boolean>;
  night?: PublicNightState;
  tokens?: PublicTokensState;
  voting?: PublicVotingState;
  reveal?: PublicRevealState;
};

// API DTOs

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

export type SnapshotResponse = {
  version: number;
  state: PublicGameState;
  private?: PrivateView;
};

export type Event = {
  version: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type EventBatch = {
  fromVersion: number;
  toVersion: number;
  events: Event[];
};

export type CommandEnvelope = {
  playerId: string;
  secret: string;
  lastKnownVersion: number;
  command: Command;
};

export type CommandBase = {
  type: string;
  payload?: Record<string, unknown>;
};

export type SetReadyCommand = {
  type: "SET_READY";
  payload: { ready: boolean };
};

export type UpdateSettingsCommand = {
  type: "UPDATE_SETTINGS";
  payload: { settings: GameSettings };
};

export type UpdateRolesCommand = {
  type: "UPDATE_ROLES";
  payload: { roles: Role[] };
};

export type StartGameCommand = { type: "START_GAME" };
export type AckRoleCommand = { type: "ACK_ROLE" };
export type StartNightCommand = { type: "START_NIGHT" };
export type AdvanceNightStepCommand = { type: "ADVANCE_NIGHT_STEP" };

export type NightActionDone = { kind: "done" };
export type DopplegangerCopy = { kind: "dopplegangerCopy"; targetPlayerId: string };
export type WerewolfSoloPeek = { kind: "werewolfSoloPeek"; centerIndex: CenterIndex };
export type SeerViewPlayer = { kind: "seerViewPlayer"; targetPlayerId: string };
export type SeerViewCenter = { kind: "seerViewCenter"; centerIndices: [CenterIndex, CenterIndex] };
export type RobberSwap = { kind: "robberSwap"; targetPlayerId: string };
export type DrunkSwap = { kind: "drunkSwap"; centerIndex: CenterIndex };
export type TroublemakerSwap = { kind: "troublemakerSwap"; targetPlayerIds: [string, string] };
export type InsomniacPeekFinal = { kind: "insomniacPeek" };

export type NightActionPayload =
  | NightActionDone
  | DopplegangerCopy
  | WerewolfSoloPeek
  | SeerViewPlayer
  | SeerViewCenter
  | RobberSwap
  | DrunkSwap
  | TroublemakerSwap
  | InsomniacPeekFinal;

export type NightActionCommand = {
  type: "NIGHT_ACTION";
  payload: NightActionPayload;
};

export type PlaceTokenCommand = {
  type: "PLACE_TOKEN";
  payload: { targetId: string; role?: Role };
};

export type RemoveTokenCommand = {
  type: "REMOVE_TOKEN";
  payload: { targetId: string };
};

export type ClearTokensCommand = { type: "CLEAR_TOKENS" };
export type StartVotingCommand = { type: "START_VOTING" };

export type SubmitVoteCommand = {
  type: "SUBMIT_VOTE";
  payload: { targetPlayerId: string };
};

export type LockVotesCommand = {
  type: "LOCK_VOTES";
  payload: { locked: boolean };
};

export type RevealResultsCommand = { type: "REVEAL_RESULTS" };
export type ResetGameCommand = { type: "RESET_GAME" };
export type LeaveGameCommand = { type: "LEAVE_GAME" };
export type KickPlayerCommand = {
  type: "KICK_PLAYER";
  payload: { playerId: string };
};

export type Command =
  | SetReadyCommand
  | UpdateSettingsCommand
  | UpdateRolesCommand
  | StartGameCommand
  | AckRoleCommand
  | StartNightCommand
  | AdvanceNightStepCommand
  | NightActionCommand
  | PlaceTokenCommand
  | RemoveTokenCommand
  | ClearTokensCommand
  | StartVotingCommand
  | SubmitVoteCommand
  | LockVotesCommand
  | RevealResultsCommand
  | ResetGameCommand
  | LeaveGameCommand
  | KickPlayerCommand;

export type CommandResponse = {
  accepted: boolean;
  appliedVersion: number;
  events: Event[];
};

export type ErrorResponse = {
  error: string;
  message: string;
};

export type VersionMismatchResponse = ErrorResponse & {
  serverVersion: number;
  replayFromVersion: number;
};
