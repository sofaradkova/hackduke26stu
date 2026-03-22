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
      "Solve for x: 3x - 5 = 16. Show each step of your work on paper.",
    finalAnswer: "x = 7",
    steps: [
      {
        stepId: "s1",
        title: "Add 5 to both sides",
        expectedWork: "3x = 21",
        acceptableForms: ["3x=21", "3x = 21", "21 = 3x"],
        commonErrors: ["subtracting 5 instead of adding", "3x = 11"],
      },
      {
        stepId: "s2",
        title: "Divide both sides by 3",
        expectedWork: "x = 7",
        acceptableForms: ["x=7", "7 = x", "x = 7"],
        commonErrors: ["dividing only the right side", "x = 21/3 not simplified"],
      },
    ],
    hintPolicy: {
      maxDirectness: "low",
      doNotRevealFinalAnswerEarly: true,
    },
  };
}

/**
 * Mock evaluator: tells a scripted ok→ok→ok→flagged story for demos.
 */
export function mockEvaluationResult(evaluationIndex: number): EvaluationResult {
  if (evaluationIndex === 0) {
    return {
      progressPercent: 20,
      category: "unsure",
      reason: "Student is getting started — initial work visible",
      confusionHighlights: [],
      confidenceScore: 0.6,
    };
  }
  if (evaluationIndex === 1) {
    return {
      progressPercent: 45,
      category: "unsure",
      reason: "Making progress — step 1 looks correct",
      confusionHighlights: [],
      confidenceScore: 0.65,
    };
  }
  if (evaluationIndex === 2) {
    return {
      progressPercent: 65,
      category: "unsure",
      reason: "Good progress through step 1",
      confusionHighlights: [],
      confidenceScore: 0.7,
    };
  }
  // index 3+
  return {
    progressPercent: 65,
    category: "wrong-approach",
    reason:
      "Off track: wrong operation in step 2 — appears to be multiplying instead of dividing both sides by 3",
    confusionHighlights: [
      "Step 2: multiplied instead of divided",
      "Expected: divide both sides by 3 → x = 7",
    ],
    confidenceScore: 0.88,
  };
}
