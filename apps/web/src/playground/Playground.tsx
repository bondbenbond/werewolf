import { useMemo, useState } from "react";
import { HomeScreen } from "../screens/HomeScreen";
import { LobbyHostScreen } from "../screens/LobbyHostScreen";
import { LobbyPlayerScreen } from "../screens/LobbyPlayerScreen";
import { NightScreen } from "../screens/NightScreen";
import { DiscussionScreen } from "../screens/DiscussionScreen";
import { VotingScreen } from "../screens/VotingScreen";
import { RevealScreen } from "../screens/RevealScreen";
import { GameBoardScreen } from "../screens/GameBoardScreen";
import { mockData } from "../mocks/mockData";
import { TopBar } from "../components/TopBar";

const screens = [
  "Home",
  "LobbyHost",
  "LobbyPlayer",
  "GameBoard",
  "Night",
  "Discussion",
  "Voting",
  "Reveal",
] as const;

export function Playground() {
  const [screen, setScreen] = useState<(typeof screens)[number]>("Home");
  const [open, setOpen] = useState(false);
  const data = useMemo(() => mockData, []);

  return (
    <div className="page">
      <div className="playground-menu">
        <button
          className="button ghost tiny"
          type="button"
          onClick={() => setOpen((value) => !value)}
        >
          Dev
        </button>
        {open ? (
          <div className="glass playground-panel">
            <div className="field">
              <label htmlFor="screen">Screen</label>
              <select
                id="screen"
                value={screen}
                onChange={(event) => setScreen(event.target.value as (typeof screens)[number])}
                className="input"
              >
                {screens.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </div>

      {screen === "Home" && <HomeScreen />}
      {screen === "LobbyHost" && <LobbyHostScreen data={data.lobby} />}
      {screen === "LobbyPlayer" && <LobbyPlayerScreen data={data.lobby} />}
      {screen === "GameBoard" && <GameBoardScreen data={data.board} />}
      {screen === "Night" && <NightScreen data={data.night} />}
      {screen === "Discussion" && <DiscussionScreen data={data.discussion} />}
      {screen === "Voting" && <VotingScreen data={data.voting} />}
      {screen === "Reveal" && <RevealScreen data={data.reveal} />}
    </div>
  );
}
