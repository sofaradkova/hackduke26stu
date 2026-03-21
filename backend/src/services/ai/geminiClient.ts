import { GoogleGenerativeAI } from "@google/generative-ai";

export type ImageInput = { buffer: Buffer; mimeType: string };

/**
 * Abstraction over Gemini: single entry point for JSON-only generations.
 * Implementations can be swapped for tests or mocks at the composition root.
 */
export interface GeminiJsonGenerator {
  generate(params: {
    model: string;
    systemInstruction?: string;
    userPrompt: string;
    image?: ImageInput;
  }): Promise<unknown>;
}

/** Strip ```json fences if the model returns markdown despite JSON mode. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  const body = fence ? fence[1]!.trim() : trimmed;
  return JSON.parse(body);
}

export class LiveGeminiJsonGenerator implements GeminiJsonGenerator {
  constructor(private readonly apiKey: string) {}

  async generate(params: {
    model: string;
    systemInstruction?: string;
    userPrompt: string;
    image?: ImageInput;
  }): Promise<unknown> {
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({
      model: params.model,
      generationConfig: {
        temperature: 0.15,
        responseMimeType: "application/json",
      },
      systemInstruction: params.systemInstruction,
    });

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [{ text: params.userPrompt }];

    if (params.image) {
      parts.push({
        inlineData: {
          mimeType: params.image.mimeType,
          data: params.image.buffer.toString("base64"),
        },
      });
    }

    const result = await model.generateContent(parts);
    const text = result.response.text();
    if (!text?.trim()) {
      throw new Error("Gemini returned an empty response body");
    }
    try {
      return parseJsonLoose(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to parse Gemini JSON: ${msg}`);
    }
  }
}
