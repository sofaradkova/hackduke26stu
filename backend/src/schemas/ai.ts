import { z } from "zod";

/** Single step in the solver's source of truth (optimized for comparison). */
export const sourceStepSchema = z.object({
  stepId: z.string(),
  title: z.string(),
  expectedWork: z.string(),
  acceptableForms: z.array(z.string()),
  commonErrors: z.array(z.string()),
});

export const hintPolicySchema = z.object({
  maxDirectness: z.enum(["low", "medium", "high"]),
  doNotRevealFinalAnswerEarly: z.boolean(),
});

/** Full structured output from ProblemSolverService / OpenAI solver. */
export const sourceOfTruthSchema = z.object({
  problemType: z.enum(["algebra", "geometry", "calculus", "other"]),
  problemText: z.string(),
  finalAnswer: z.string(),
  steps: z.array(sourceStepSchema).min(1),
  hintPolicy: hintPolicySchema,
});

export type SourceOfTruth = z.infer<typeof sourceOfTruthSchema>;

export const evaluationCategorySchema = z.enum([
  "wrong-approach",
  "stuck",
  "off-topic",
  "calc-error",
  "unsure",
]);

export type EvaluationCategory = z.infer<typeof evaluationCategorySchema>;

/** Structured output from ProgressEvaluatorService (screenshot evaluations). */
export const evaluationResultSchema = z.object({
  progressPercent: z.number().min(0).max(100),
  reason: z.string(),
  category: evaluationCategorySchema,
  confidenceScore: z.number().min(0).max(1),
  confusionHighlights: z.array(z.string()),
});

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
