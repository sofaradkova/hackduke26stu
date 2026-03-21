import { sourceOfTruthSchema, type SourceOfTruth } from "../../schemas/ai.js";
import { env } from "../../lib/env.js";
import { AiValidationError } from "../../lib/aiErrors.js";
import type { GeminiJsonGenerator, ImageInput } from "./geminiClient.js";
import { mockSourceOfTruth } from "./mockAi.js";

const SOLVER_SYSTEM = `You are a precise math tutor backend. You read problem images and output ONLY JSON that matches the requested schema. No markdown, no prose outside JSON.`;

const SOLVER_PROMPT = `From the attached screenshot:
1) Read the full problem statement (transcribe into problemText).
2) Classify problemType as one of: algebra, geometry, calculus, other.
3) Solve step-by-step internally, then emit a structured "source of truth" for comparing student work later.
4) For each step provide: stepId (short snake_case id), title, expectedWork (what correct work should look like at that step), acceptableForms (alternate correct notations), commonErrors (short labels).
5) finalAnswer: concise final result string.
6) hintPolicy: maxDirectness is usually "low" for homework help; set doNotRevealFinalAnswerEarly true unless the rubric requires otherwise.

Return ONLY valid JSON with this exact shape:
{
  "problemType": "algebra | geometry | calculus | other",
  "problemText": "string",
  "finalAnswer": "string",
  "steps": [
    {
      "stepId": "string",
      "title": "string",
      "expectedWork": "string",
      "acceptableForms": ["string"],
      "commonErrors": ["string"]
    }
  ],
  "hintPolicy": {
    "maxDirectness": "low | medium | high",
    "doNotRevealFinalAnswerEarly": true
  }
}

Optimize fields for downstream programmatic comparison (clear, unambiguous), not essay-style explanation.`;

export interface ProblemSolverService {
  solveFromImage(image: ImageInput): Promise<SourceOfTruth>;
}

export function createProblemSolverService(deps: {
  gemini: GeminiJsonGenerator | null;
  useMock: boolean;
}): ProblemSolverService {
  return {
    async solveFromImage(image: ImageInput): Promise<SourceOfTruth> {
      if (deps.useMock || !deps.gemini) {
        // Mock ignores image but keeps API shape identical.
        return mockSourceOfTruth();
      }

      const raw = await deps.gemini.generate({
        model: env.geminiSolverModel,
        systemInstruction: SOLVER_SYSTEM,
        userPrompt: SOLVER_PROMPT,
        image,
      });

      const parsed = sourceOfTruthSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AiValidationError(
          "Solver response failed schema validation",
          parsed.error,
        );
      }
      return parsed.data;
    },
  };
}
