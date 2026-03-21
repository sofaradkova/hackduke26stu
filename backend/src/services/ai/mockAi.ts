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
  const categories: EvaluationCategory[] = [
    "unsure",
    "calc-error",
    "stuck",
    "wrong-approach",
    "off-topic",
  ];
  const category = categories[evaluationIndex % categories.length]!;

  const reasons = [
    "Handwriting is partly legible; student started isolating x but arithmetic on the constant is unclear.",
    "The linear structure matches the problem, but one operation on the constant term looks inconsistent.",
    "Little forward movement between this shot and the expected next step—same scratch work repeated.",
  ];
  const reason =
    reasons[Math.min(evaluationIndex, reasons.length - 1)] ??
    "Work is converging toward the expected solution path.";

  const confusionHighlights =
    evaluationIndex === 0
      ? ["constant term move", "sign on subtraction"]
      : evaluationIndex === 1
        ? ["line 2: 2x = ?", "check both sides"]
        : ["stuck repeating prior step"];

  return {
    progressPercent,
    reason,
    category,
    confidenceScore: evaluationIndex === 0 ? 0.55 : 0.72,
    confusionHighlights,
  };
}
