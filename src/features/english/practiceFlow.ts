import type { Evaluation } from "./types";

export const AUTO_ADVANCE_MS = 2000;

export function shouldAutoAdvance(verdict: Evaluation["verdict"]) {
  return verdict === "acceptable";
}

export function shouldFocusAnswerInput({ view, hasEvaluation, finished }: { view: string; hasEvaluation: boolean; finished: boolean }) {
  return view === "practice" && !hasEvaluation && !finished;
}
