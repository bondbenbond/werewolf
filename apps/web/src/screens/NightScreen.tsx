import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { GameBoardScreen, type GameBoardData } from "./GameBoardScreen";

type NightData = {
  step: string;
  instruction: string;
  remaining: string;
  role?: string;
  roleInstruction?: string;
};

export function NightScreen({
  data,
  board,
  isHost,
  showActionModal,
  waiting,
  actionActive,
  actionInstruction,
  onStartAction,
}: {
  data: NightData;
  board?: GameBoardData;
  isHost?: boolean;
  showActionModal?: boolean;
  waiting?: boolean;
  actionActive?: boolean;
  actionInstruction?: string;
  onStartAction?: () => void;
}) {
  return (
    <>
      {board ? (
        <GameBoardScreen data={board} isHost={isHost} initialRoleModal={false} showHostBar={false} />
      ) : (
        <Panel title="Night Phase">
          <div className="glass" style={{ marginBottom: 12 }}>
            <p className="eyebrow">Current step</p>
            <h2 style={{ margin: 0, color: "#f8fafc" }}>{data.step}</h2>
            <p className="lede">{data.instruction}</p>
            <p className="lede">{data.remaining}</p>
          </div>
          <div className="cta-row">
            <Button>Advance</Button>
            <Button variant="ghost">Nudge</Button>
          </div>
        </Panel>
      )}
      {showActionModal ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Your action</p>
            <h3>{data.role ?? "Role action"}</h3>
            <p className="lede">{data.roleInstruction ?? "Perform your night action."}</p>
            <Button variant="success" onClick={onStartAction}>
              Start action
            </Button>
          </div>
        </div>
      ) : null}
      {waiting ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Waiting</p>
            <h3>Waiting for your turn</h3>
            <p className="lede">{data.remaining}</p>
          </div>
        </div>
      ) : null}
      {actionActive ? (
        <div className="action-banner">
          <span>{actionInstruction ?? "Perform your night action on the board."}</span>
        </div>
      ) : null}
      {isHost ? (
        <div className="host-bar">
          <Button size="small" variant="success">
            Next step
          </Button>
          <Button size="small" variant="ghost">
            Advance phase
          </Button>
        </div>
      ) : null}
    </>
  );
}
