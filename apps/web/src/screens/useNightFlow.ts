import { useCallback, useEffect, useState } from "react";
import type { NightSelections } from "./nightRoleHelpers";

type ActionState = "idle" | "selecting" | "confirmed";

type UseNightFlowArgs = {
  phase: string;
  nightStep?: string | null;
  doppleFollowupRole?: string;
  currentNightStepKey: string | null;
  onNightAction?: (payload: Record<string, unknown>) => void | Promise<void>;
};

export const useNightFlow = ({
  phase,
  nightStep,
  doppleFollowupRole,
  currentNightStepKey,
  onNightAction,
}: UseNightFlowArgs) => {
  const [nightSelections, setNightSelections] = useState<NightSelections>({
    players: [],
    centers: [],
  });
  const [nightActionState, setNightActionState] = useState<ActionState>("idle");
  const [nightActionPending, setNightActionPending] = useState(false);
  const [nightActionError, setNightActionError] = useState<string | null>(null);
  const [completedNightStepKey, setCompletedNightStepKey] = useState<string | null>(null);
  const [showDoppleFollowupModal, setShowDoppleFollowupModal] = useState(false);
  const [doppleFollowupTriggered, setDoppleFollowupTriggered] = useState(false);
  const [doppleFollowupRoleLabel, setDoppleFollowupRoleLabel] = useState<string>("role");

  useEffect(() => {
    if (phase !== "night") {
      setNightSelections({ players: [], centers: [] });
      setNightActionState("idle");
      setNightActionPending(false);
      setNightActionError(null);
      setCompletedNightStepKey(null);
      setShowDoppleFollowupModal(false);
      setDoppleFollowupTriggered(false);
      setDoppleFollowupRoleLabel("role");
      return;
    }
    setNightSelections({ players: [], centers: [] });
    setNightActionState("idle");
    setNightActionPending(false);
    setNightActionError(null);
    setCompletedNightStepKey(null);
    setShowDoppleFollowupModal(false);
    setDoppleFollowupTriggered(false);
    setDoppleFollowupRoleLabel("role");
  }, [phase, nightStep]);

  useEffect(() => {
    if (phase !== "night") return;
    if (nightActionState !== "confirmed") return;
    if (!doppleFollowupRole) return;
    if (doppleFollowupTriggered) return;
    setDoppleFollowupRoleLabel(doppleFollowupRole);
    const timer = window.setTimeout(() => {
      setDoppleFollowupTriggered(true);
      setShowDoppleFollowupModal(true);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [phase, doppleFollowupRole, doppleFollowupTriggered, nightActionState]);

  const markNightActionConfirmed = useCallback(() => {
    setNightActionState("confirmed");
    if (currentNightStepKey) {
      setCompletedNightStepKey(currentNightStepKey);
    }
  }, [currentNightStepKey]);

  const submitNightAction = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!onNightAction) return;
      setNightActionError(null);
      setNightActionPending(true);
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Action timed out")), 8000);
        });
        await Promise.race([Promise.resolve(onNightAction(payload)), timeoutPromise]);
      } catch (error) {
        const message =
          error instanceof Error && error.message === "Action timed out"
            ? "Action is taking too long. Please try again."
            : "Action failed. Please tap again.";
        setNightActionError(message);
        throw error;
      } finally {
        setNightActionPending(false);
      }
    },
    [onNightAction]
  );

  return {
    nightSelections,
    setNightSelections,
    nightActionState,
    setNightActionState,
    nightActionPending,
    nightActionError,
    setNightActionError,
    completedNightStepKey,
    showDoppleFollowupModal,
    setShowDoppleFollowupModal,
    doppleFollowupRoleLabel,
    submitNightAction,
    markNightActionConfirmed,
  };
};
