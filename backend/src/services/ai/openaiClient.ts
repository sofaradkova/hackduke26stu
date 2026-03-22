import OpenAI from "openai";
import { parseJsonLoose } from "../../lib/jsonUtils.js";

export type ImageInput = { buffer: Buffer; mimeType: string };

/**
 * OpenAI Chat Completions with JSON object output and optional vision input.
 */
export interface OpenAiJsonGenerator {
  generate(params: {
    model: string;
    systemInstruction?: string;
    userPrompt: string;
    image?: ImageInput;
  }): Promise<unknown>;
}

export class LiveOpenAiJsonGenerator implements OpenAiJsonGenerator {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(params: {
    model: string;
    systemInstruction?: string;
    userPrompt: string;
    image?: ImageInput;
  }): Promise<unknown> {
    const userParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: params.userPrompt },
    ];
    if (params.image) {
      const dataUrl = `data:${params.image.mimeType};base64,${params.image.buffer.toString("base64")}`;
      userParts.push({
        type: "image_url",
        image_url: { url: dataUrl },
      });
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (params.systemInstruction) {
      messages.push({ role: "system", content: params.systemInstruction });
    }
    messages.push({ role: "user", content: userParts });

    const response = await this.client.chat.completions.create({
      model: params.model,
      messages,
      temperature: 0.15,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content;
    if (!text?.trim()) {
      throw new Error("OpenAI returned an empty response body");
    }
    try {
      return parseJsonLoose(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to parse OpenAI JSON: ${msg}`);
    }
  }
}
