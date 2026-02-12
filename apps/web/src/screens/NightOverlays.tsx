import { Button } from "../components/Button";

type NightOverlaysProps = {
  phase: "deal" | "nightCountdown" | "night" | "parallelResult" | "discussion" | "voting" | "reveal";
  isHost?: boolean;
  phaseRemaining?: number | null;
  boardPhaseSecondsRemaining?: number | null;
  showNightHintBanner: boolean;
  nightWaiting?: boolean;
  nightStep: string;
  nightActionError: string | null;
  nightActionPending: boolean;
  roleKey: string;
  nightActionState: "idle" | "selecting" | "confirmed";
  nightRoleInstruction?: string;
  nightInstruction: string;
  showNightStartModal: boolean;
  nightRole?: string;
  startActionLabel: string;
  onStartNightAction: () => void;
  showDoppleFollowupModal: boolean;
  doppleFollowupRoleLabel: string;
  onStartDoppleAction: () => void;
  showNightWaitingModal: boolean;
  nextStepLabel: string;
  nextStep?: string | null;
  nightCountdown: number | null;
  nightRemaining: string;
  showParallelResultModal: boolean;
  parallelResultCountdown: number | null;
  nightResultLines?: string[];
  discussionHintVisible: boolean;
  votingReady: boolean;
  revealResultsVisible: boolean;
  revealWinners: string;
  revealEliminated: string;
  onShowRevealResults: () => void;
};

export function NightOverlays({
  phase,
  isHost,
  phaseRemaining,
  boardPhaseSecondsRemaining,
  showNightHintBanner,
  nightWaiting,
  nightStep,
  nightActionError,
  nightActionPending,
  roleKey,
  nightActionState,
  nightRoleInstruction,
  nightInstruction,
  showNightStartModal,
  nightRole,
  startActionLabel,
  onStartNightAction,
  showDoppleFollowupModal,
  doppleFollowupRoleLabel,
  onStartDoppleAction,
  showNightWaitingModal,
  nextStepLabel,
  nextStep,
  nightCountdown,
  nightRemaining,
  showParallelResultModal,
  parallelResultCountdown,
  nightResultLines,
  discussionHintVisible,
  votingReady,
  revealResultsVisible,
  revealWinners,
  revealEliminated,
  onShowRevealResults,
}: NightOverlaysProps) {
  return (
    <>
      {phase === "nightCountdown" ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Night starting</p>
            <h3>Get ready</h3>
            <p className="lede">Beginning in {phaseRemaining ?? boardPhaseSecondsRemaining ?? "a moment"}...</p>
          </div>
        </div>
      ) : null}

      {showNightHintBanner ? (
        <div className={`action-banner ${isHost ? "action-banner-host" : ""}`}>
          <span>
            {nightWaiting
              ? `Waiting · ${nightStep}`
              : nightActionError
              ? nightActionError
              : nightActionPending
              ? ["seer", "werewolf", "drunk"].includes(roleKey)
                ? "Revealing card..."
                : "Submitting action..."
              : nightActionState === "confirmed"
              ? ["mason", "minion"].includes(roleKey)
                ? `Action confirmed · ${nightRoleInstruction ?? nightInstruction}`
                : "Action confirmed"
              : nightRoleInstruction ?? nightInstruction}
          </span>
        </div>
      ) : null}

      {showNightStartModal ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Your action</p>
            <h3>{nightRole ?? "Role action"}</h3>
            <p className="lede">{nightRoleInstruction ?? nightInstruction}</p>
            <Button
              variant="success"
              loading={nightActionPending}
              disabled={nightActionPending}
              onClick={onStartNightAction}
            >
              {startActionLabel}
            </Button>
          </div>
        </div>
      ) : null}

      {showDoppleFollowupModal ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Copied role</p>
            <h3>Perform your doppleganger action</h3>
            <p className="lede">You saw the {doppleFollowupRoleLabel} card, perform that action now.</p>
            <Button
              variant="success"
              loading={nightActionPending}
              disabled={nightActionPending}
              onClick={onStartDoppleAction}
            >
              Start action
            </Button>
          </div>
        </div>
      ) : null}

      {showNightWaitingModal ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Waiting</p>
            <h3>Waiting for your turn</h3>
            <p className="lede">Current role: {nightStep}</p>
            <p className="lede">
              {nextStepLabel}: {nextStep ?? "Discussion"}
            </p>
            <p className="lede">{nightCountdown !== null ? `Time left: ${nightCountdown}s` : nightRemaining}</p>
          </div>
        </div>
      ) : null}

      {showParallelResultModal ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Night results</p>
            <h3>{nightRole ?? "Your result"}</h3>
            {(nightResultLines?.length ?? 0) > 0 ? (
              <div className="lede" style={{ display: "grid", gap: 6 }}>
                {nightResultLines?.map((line, index) => (
                  <p key={`result-line-${index}`} className="lede">
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <p className="lede">No night result for your role.</p>
            )}
            <p className="lede">
              {parallelResultCountdown !== null
                ? `Discussion starts in ${parallelResultCountdown}s`
                : "Discussion starts soon"}
            </p>
          </div>
        </div>
      ) : null}

      {phase === "discussion" && discussionHintVisible ? (
        <div className="action-banner">
          <span>Tap a player to place a suspicion coin</span>
        </div>
      ) : null}

      {phase === "voting" ? (
        votingReady ? (
          <div className="action-banner">
            <span>Tap a player to vote</span>
          </div>
        ) : (
          <div className="overlay">
            <div className="overlay-card action-card">
              <p className="eyebrow">Voting</p>
              <h3>Cast your vote</h3>
              <p className="lede">Starting in 2 seconds…</p>
            </div>
          </div>
        )
      ) : null}

      {phase === "reveal" && !revealResultsVisible ? (
        <div className="overlay">
          <div className="overlay-card action-card">
            <p className="eyebrow">Reveal</p>
            <h3>Winners: {revealWinners}</h3>
            <p className="lede">Eliminated: {revealEliminated}</p>
            <Button variant="success" onClick={onShowRevealResults}>
              Show results
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
