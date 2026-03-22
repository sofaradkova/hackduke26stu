import type {
  EvaluationCategory,
  EvaluationResult,
  SourceOfTruth,
} from "../../schemas/ai.js";

/** Deterministic mock source of truth for demos without OpenAI. */
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
 * Mock evaluator: progressPercent rises with each call so demos show progression.
 */
export function mockEvaluationResult(evaluationIndex: number): EvaluationResult {
  const progressPercent = Math.min(25 + evaluationIndex * 35, 100);

  /** One row per category so mock labels align with reasons (stuck ≠ wrong work). */
  const cycle: {
    category: EvaluationCategory;
    reason: string;
    confusionHighlights: string[];
  }[] = [
    {
      category: "unsure",
      reason:
        "Handwriting is partly legible; hard to confirm whether the student subtracted 5 on both sides.",
      confusionHighlights: ["constant term move", "sign on subtraction"],
    },
    {
      category: "calc-error",
      reason:
        "The setup matches subtracting 5 from both sides, but the resulting constant on the right looks inconsistent with 17 − 5.",
      confusionHighlights: ["line 2: 2x = ?", "check 17 − 5"],
    },
    {
      category: "wrong-approach",
      reason:
        "The student appears to be squaring both sides or using a nonlinear move that does not match this linear equation—strategy diverges from isolating x.",
      confusionHighlights: ["linear vs nonlinear step", "expected: subtract 5"],
    },
    {
      category: "stuck",
      reason:
        "No new lines since the prior screenshot—the same incomplete expression is repeated without a next algebraic step.",
      confusionHighlights: ["no forward progress", "same scratch repeated"],
    },
    {
      category: "off-topic",
      reason:
        "Visible work looks unrelated to solving 2x + 5 = 17 (different symbols or task).",
      confusionHighlights: ["off-topic scratch"],
    },
  ];

  const row = cycle[evaluationIndex % cycle.length]!;

  return {
    progressPercent,
    reason: row.reason,
    category: row.category,
    confidenceScore: evaluationIndex === 0 ? 0.55 : 0.72,
    confusionHighlights: row.confusionHighlights,
  };
}
