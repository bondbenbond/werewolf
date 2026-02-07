export const mockData = {
  lobby: {
    roomCode: "ABCD",
    gameName: "",
    shareUrl: "https://play.werewolf/game?room=ABCD",
    roles: [
      { name: "Werewolf", count: 0 },
      { name: "Minion", count: 0 },
      { name: "Mason", count: 0 },
      { name: "Seer", count: 0 },
      { name: "Robber", count: 0 },
      { name: "Troublemaker", count: 0 },
      { name: "Drunk", count: 0 },
      { name: "Insomniac", count: 0 },
      { name: "Doppleganger", count: 0 },
      { name: "Tanner", count: 0 },
      { name: "Villager", count: 0 },
    ],
    settings: {
      autoAdvance: true,
      parallelNight: false,
      nightStepSeconds: 10,
      parallelResultSeconds: 10,
      discussionSeconds: 300,
      votingSeconds: 10,
    },
    players: [
      { playerId: "host-1", name: "Host", connected: true, ready: true, host: true },
      { playerId: "player-1", name: "Player 1", connected: true, ready: false },
      { playerId: "player-2", name: "Player 2", connected: true, ready: true },
      { playerId: "player-3", name: "Player 3", connected: false, ready: false },
    ],
    startCountdownSeconds: 10,
  },
  night: {
    step: "Seer",
    instruction: "View a player or two center cards.",
    remaining: "2 of 4 players complete",
  },
  discussion: {
    timer: "04:15",
    tokens: [
      { name: "Player 1", tokens: 2 },
      { name: "Player 2", tokens: 1 },
      { name: "Player 3", tokens: 0 },
    ],
  },
  voting: {
    timer: "01:10",
    votes: [
      { name: "Player 1", count: 1 },
      { name: "Player 2", count: 2 },
      { name: "Player 3", count: 0 },
    ],
  },
  reveal: {
    eliminated: "Player 2",
    winners: "Village",
  },
  board: {
    title: "Game Board",
    phase: "Deal",
    phaseSecondsRemaining: 10,
    phaseSecondsTotal: 10,
    playerName: "Ben",
    role: {
      name: "Robber",
      description: "Keep it secret. Tap acknowledge once you've seen it.",
    },
    cards: Array.from({ length: 12 }, (_, idx) => {
      const isCenter = idx < 3;
      const playerIndex = idx - 2;
      return {
        id: `card-${idx + 1}`,
        label: isCenter ? `Center ${idx + 1}` : playerIndex === 1 ? "Ben" : `Player ${playerIndex}`,
        type: isCenter ? ("center" as const) : ("player" as const),
      };
    }),
  },
};
