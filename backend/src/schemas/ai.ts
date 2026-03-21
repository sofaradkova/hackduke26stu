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

/** Full structured output from ProblemSolverService / Gemini solver. */
export const sourceOfTruthSchema = z.object({
  problemType: z.enum(["algebra", "geometry", "calculus", "other"]),
  problemText: z.string(),
  finalAnswer: z.string(),
  steps: z.array(sourceStepSchema).min(1),
  hintPolicy: hintPolicySchema,
});

export type SourceOfTruth = z.infer<typeof sourceOfTruthSchema>;

/** Subscores from the progress evaluator (0–10 each, per contract). */
export const subscoresSchema = z.object({
  correctness: z.number().int().min(0).max(10),
  progress: z.number().int().min(0).max(10),
  alignment: z.number().int().min(0).max(10),
  confidence: z.number().int().min(0).max(10),
});

/** Structured output from ProgressEvaluatorService / Gemini evaluator. */
export const evaluationResultSchema = z.object({
  currentStepId: z.string().nullable(),
  workSummary: z.string(),
  subscores: subscoresSchema,
  score: z.number().int().min(0).max(10),
  isStuck: z.boolean(),
  misconception: z.string().nullable(),
  hint: z.string(),
});

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
