export const mockData = {
  lobby: {
    roomCode: "ABCD",
    gameName: "",
    shareUrl: "https://play.werewolf/game?room=ABCD",
    roles: [
      { name: "Werewolf", count: 2 },
      { name: "Minion", count: 1 },
      { name: "Mason", count: 2 },
      { name: "Seer", count: 1 },
      { name: "Robber", count: 1 },
      { name: "Troublemaker", count: 1 },
      { name: "Drunk", count: 0 },
      { name: "Insomniac", count: 1 },
      { name: "Doppleganger", count: 0 },
      { name: "Tanner", count: 0 },
      { name: "Villager", count: 2 },
    ],
    settings: {
      autoAdvance: true,
      parallelNight: false,
      nightStepSeconds: 10,
      discussionSeconds: 300,
      votingSeconds: 10,
    },
    players: [
      { name: "Host", connected: true, ready: true },
      { name: "Player 1", connected: true, ready: false },
      { name: "Player 2", connected: true, ready: true },
      { name: "Player 3", connected: false, ready: false },
    ],
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
    cards: Array.from({ length: 12 }, (_, idx) => ({
      id: `card-${idx + 1}`,
      label: `Card ${idx + 1}`,
    })),
  },
};
