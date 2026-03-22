import { z } from "zod";
import { evaluationCategorySchema, evaluationResultSchema, sourceOfTruthSchema } from "./ai.js";

/** Response body for POST /api/sessions */
export const createSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  sourceOfTruth: sourceOfTruthSchema,
  status: z.enum(["active", "stuck", "complete"]),
});

/** One stored evaluation record (API shape mirrors persistence). */
export const evaluationRecordSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  screenshotPath: z.string(),
  timestamp: z.string(),
  evaluationResult: evaluationResultSchema,
});

/** Response for GET /api/sessions/:id */
export const sessionDetailResponseSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().nullable(),
  classId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(["active", "stuck", "complete"]),
  sourceOfTruth: sourceOfTruthSchema,
  latestProgressPercent: z.number().nullable(),
  latestReason: z.string().nullable(),
  latestCategory: evaluationCategorySchema.nullable(),
  latestConfidenceScore: z.number().nullable(),
  latestConfusionHighlights: z.array(z.string()).nullable(),
  evaluations: z.array(evaluationRecordSchema),
});

/** Response for POST .../screenshots (same shape as stored evaluation). */
export const screenshotEvalResponseSchema = evaluationResultSchema;
