import type { EvaluationResult, SourceOfTruth } from "../../schemas/ai.js";

/** Deterministic mock source of truth for demos without Gemini. */
export function mockSourceOfTruth(): SourceOfTruth {
  return {
    problemType: "algebra",
    problemText:
      "Solve for x: 2x + 5 = 17. Show each step of your work on paper.",
    finalAnswer: "x = 6",
    steps: [
      {
        stepId: "s1",
        title: "Subtract 5 from both sides",
        expectedWork: "2x = 12",
        acceptableForms: ["2x=12", "2x = 12", "12 = 2x"],
        commonErrors: ["subtracting 5 from one side only", "2x = 22"],
      },
      {
        stepId: "s2",
        title: "Divide both sides by 2",
        expectedWork: "x = 6",
        acceptableForms: ["x=6", "6 = x", "x = 6"],
        commonErrors: ["dividing only the right side", "x = 12/2 not simplified"],
      },
    ],
    hintPolicy: {
      maxDirectness: "low",
      doNotRevealFinalAnswerEarly: true,
    },
  };
}

/**
 * Mock evaluator: score rises slightly with each call so demos show progression.
 */
export function mockEvaluationResult(evaluationIndex: number): EvaluationResult {
  const base = Math.min(3 + evaluationIndex * 2, 10);
  const score = base;
  const stepId = score < 5 ? "s1" : score < 10 ? "s2" : "s2";
  const stuck = score === 3 && evaluationIndex === 0;

  return {
    currentStepId: stepId,
    workSummary:
      evaluationIndex === 0
        ? "Started isolating the variable; check both sides stay balanced."
        : evaluationIndex === 1
          ? "Closer: linear structure looks right; verify arithmetic on the constant term."
          : "Work aligns with the expected solution path.",
    subscores: {
      correctness: Math.min(score, 9),
      progress: Math.min(score + 1, 10),
      alignment: Math.max(score - 1, 0),
      confidence: 7,
    },
    score,
    isStuck: stuck,
    misconception: stuck ? "unbalanced_subtraction" : null,
    hint: stuck
      ? "Whatever you do to one side of the equation, do the same to the other."
      : score < 7
        ? "Double-check the operation you used to move the constant term."
        : "Nice progress—simplify and state the final value for x.",
  };
}
