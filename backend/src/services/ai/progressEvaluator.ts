import {
  evaluationResultSchema,
  type EvaluationResult,
  type SourceOfTruth,
} from "../../schemas/ai.js";
import { env } from "../../lib/env.js";
import type { OpenAiJsonGenerator } from "./openaiClient.js";
import { mockEvaluationResult } from "./mockAi.js";
import { AiValidationError } from "../../lib/aiErrors.js";

const EVAL_SYSTEM = `You are a math progress checker. You compare a photo of student work to a canonical solution plan. Output ONLY JSON matching the schema. Be conservative: if handwriting is unclear, lower confidenceScore and progressPercent.`;

function buildEvaluatorPrompt(
  sourceOfTruth: SourceOfTruth,
  previous: EvaluationResult | undefined,
): string {
  const prev = previous
    ? `\nPrevious evaluation JSON (for continuity):\n${JSON.stringify(previous)}\n`
    : "";

  return `SOURCE_OF_TRUTH (canonical):\n${JSON.stringify(sourceOfTruth)}\n${prev}
Attached: latest student work screenshot.

Return ONLY valid JSON with this exact shape:
{
  "progressPercent": number,
  "reason": "string",
  "category": "wrong-approach" | "stuck" | "off-topic" | "calc-error" | "unsure",
  "confidenceScore": number,
  "confusionHighlights": ["string"]
}

Rules:
- progressPercent: 0-100 (how close the visible work is to finishing correctly on the intended path).
- reason: one short paragraph (2-4 sentences max) explaining the judgment.
- category: pick the single best label.
- confidenceScore: 0-1 how sure you are given image quality and clarity.
- confusionHighlights: 0-5 short phrases pointing at what is ambiguous or wrong (empty array if none).`;
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
  openai: OpenAiJsonGenerator | null;
  useMock: boolean;
}): ProgressEvaluatorService {
  return {
    async evaluate(input): Promise<EvaluationResult> {
      if (deps.useMock || !deps.openai) {
        return mockEvaluationResult(input.evaluationIndex);
      }

      const raw = await deps.openai.generate({
        model: env.openaiModel,
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
