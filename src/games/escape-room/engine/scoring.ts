export const SCORING = {
  baseBudgetPerStage: 100,
  hintPenalty: 15,
  retryPenalty: 5,
  timePenaltyPerSecond: 0.25,
} as const;

export interface StageBreakdown {
  stageIndex: number;
  archetypeId: string;
  solved: boolean;
  hintsShown: number;
  retries: number;
  elapsedSeconds: number;
  stageScore: number;
}

export function scoreStage(args: {
  solved: boolean;
  hintsShown: number;
  retries: number;
  elapsedSeconds: number;
}): number {
  if (!args.solved) return 0;
  const raw =
    SCORING.baseBudgetPerStage -
    args.elapsedSeconds * SCORING.timePenaltyPerSecond -
    args.hintsShown * SCORING.hintPenalty -
    args.retries * SCORING.retryPenalty;
  return Math.max(0, Math.round(raw));
}
