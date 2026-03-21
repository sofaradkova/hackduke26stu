import { ZodError } from "zod";
import {
  evaluationResultSchema,
  type EvaluationResult,
  type SourceOfTruth,
} from "../../schemas/ai.js";
import { env } from "../../lib/env.js";
import type { GeminiJsonGenerator } from "./geminiClient.js";
import { mockEvaluationResult } from "./mockAi.js";
import { AiValidationError } from "../../lib/aiErrors.js";

const EVAL_SYSTEM = `You are a math progress checker. You compare a photo of student work to a canonical solution plan. Output ONLY JSON matching the schema. Be conservative: if handwriting is unclear, lower confidence and score.`;

function buildEvaluatorPrompt(
  sourceOfTruth: SourceOfTruth,
  previous: EvaluationResult | undefined,
): string {
  const prev = previous
    ? `\nPrevious evaluation JSON (for continuity):\n${JSON.stringify(previous)}\n`
    : "";

  return `SOURCE_OF_TRUTH (canonical):\n${JSON.stringify(sourceOfTruth)}\n${prev}
Attached: latest student work screenshot.

Tasks:
1) Infer currentStepId: match to a stepId from SOURCE_OF_TRUTH steps, or null if unclear.
2) workSummary: one short sentence describing what you see.
3) subscores: each 0-10 integers — correctness (math so far), progress (how far along), alignment (matches intended method), confidence (how sure you are from the image).
4) score: single 0-10 overall (use rubric: 0-2 off track, 3-4 major issues, 5-6 partial, 7-8 mostly on track, 9-10 very on track).
5) isStuck: true if little/no productive movement or repeated same mistake.
6) misconception: short snake_case label or null.
7) hint: ONE short hint only. Follow hintPolicy: usually do NOT state the final answer unless isStuck is true AND subscores show severe difficulty (then at most a nudge, not full solution).

Return ONLY valid JSON:
{
  "currentStepId": "string | null",
  "workSummary": "string",
  "subscores": {
    "correctness": number,
    "progress": number,
    "alignment": number,
    "confidence": number
  },
  "score": number,
  "isStuck": boolean,
  "misconception": "string | null",
  "hint": "string"
}`;
}

export interface ProgressEvaluatorService {
  evaluate(input: {
    image: { buffer: Buffer; mimeType: string };
    sourceOfTruth: SourceOfTruth;
    previousEvaluation?: EvaluationResult;
    /** Used by mock backend to simulate progression. */
    evaluationIndex: number;
  }): Promise<EvaluationResult>;
}

export function createProgressEvaluatorService(deps: {
  gemini: GeminiJsonGenerator | null;
  useMock: boolean;
}): ProgressEvaluatorService {
  return {
    async evaluate(input): Promise<EvaluationResult> {
      if (deps.useMock || !deps.gemini) {
        return mockEvaluationResult(input.evaluationIndex);
      }

      const raw = await deps.gemini.generate({
        model: env.geminiEvaluatorModel,
        systemInstruction: EVAL_SYSTEM,
        userPrompt: buildEvaluatorPrompt(
          input.sourceOfTruth,
          input.previousEvaluation,
        ),
        image: input.image,
      });

      const parsed = evaluationResultSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AiValidationError(
          "Evaluator response failed schema validation",
          parsed.error,
        );
      }
      return parsed.data;
    },
  };
}
