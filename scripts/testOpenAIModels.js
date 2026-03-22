#!/usr/bin/env node
/**
 * OpenAI Model Testing Script
 * Tests different vision models on apparse.png and logs results to aplogs/
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Native fetch is available in Node 18+

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");
const APLOGS_DIR = path.join(PROJECT_ROOT, "aplogs");
const IMAGE_PATH = path.join(PROJECT_ROOT, "src", "assets", "apparse.png");

// OpenAI Configuration - read from .env manually (no dotenv dependency)
const envContent = await fs.readFile(path.join(PROJECT_ROOT, ".env"), "utf8").catch(() => "");
const envVars = {};
envContent.split("\n").forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});

const OPENAI_API_KEY = envVars.VITE_OPENAI_API_KEY || envVars.OPENAI_API_KEY;
const OPENAI_BASE_URL = "https://api.openai.com/v1";

// Models to test
const MODELS = [
  { id: "gpt-4o", name: "GPT-4o", maxTokens: 2000 },
  { id: "gpt-5.4", name: "GPT-5.4", maxTokens: 4000 },
  { id: "gpt-5.4-nano", name: "GPT-5.4-nano", maxTokens: 8000 },
  { id: "gpt-4.1", name: "GPT-4.1", maxTokens: 2000 },
];

const SYSTEM_PROMPT = `You are an expert mathematics tutor analyzing a student's calculus worksheet. You MUST verify all answers by solving problems yourself first.

--- STEP 1: SOLVE THE PROBLEM YOURSELF
Before analyzing student work:
- Solve each problem completely and compute the EXACT correct answer
- For integrals: set up the integral and compute the numerical result
- For areas: identify bounds, set up ∫[top-bottom]dx, compute
- For volumes: use disk/washer/shell method correctly, compute
- Store your computed answer - you will compare against the student's answer

--- STEP 2: TRANSCRIBE

Problem Content (Exact transcription of printed text)

Student Work (Transcribed)
- Line-by-line transcription of student handwriting
- Mark [unclear] for ambiguous handwriting
- NEVER invent missing work

--- STEP 3: VERIFY CORRECTNESS (Critical)

CORRECT ANSWER (from your calculation):
- State the mathematically correct answer with work shown

STUDENT'S ANSWER:
- State what the student wrote as their final answer

VERDICT:
- CORRECT: Student's answer matches your computed answer (within reasonable rounding)
- PARTIAL: Student has correct setup but wrong final answer
- UNCHECKABLE: Cannot verify due to missing work

If INCORRECT:
- Show what the correct answer should be
- Identify the likely error

--- OUTPUT FORMAT

📋 PROBLEM
[Exact problem text]

🎯 CORRECT ANSWER
[Your computed answer with brief work]

✏️ STUDENT WORK
[Transcribed handwriting]

📊 VERDICT: CORRECT / INCORRECT / PARTIAL / UNCHECKABLE

❌ ERRORS FOUND (if any)

🧠 CONCEPTUAL UNDERSTANDING
- What they understand
- What they're missing

📝 NEXT STEPS`;

// Ensure aplogs directory exists
async function ensureAplogsDir() {
  try {
    await fs.mkdir(APLOGS_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create aplogs directory:", err);
    process.exit(1);
  }
}

// Log to file
async function logToFile(filename, data) {
  const filepath = path.join(APLOGS_DIR, filename);
  await fs.appendFile(filepath, JSON.stringify(data) + "\n", "utf8");
  return filepath;
}

// Test a single model
async function testModel(model, imageBase64) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  console.log(`\n🧪 Testing ${model.name} (${model.id})...`);
  console.log(`   Max tokens: ${model.maxTokens}`);
  
  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: SYSTEM_PROMPT },
              { 
                type: "image_url", 
                image_url: { url: `data:image/png;base64,${imageBase64}` } 
              }
            ]
          }
        ],
        max_completion_tokens: model.maxTokens,
        stream: false,
      }),
    });

    const endTime = Date.now();
    const latency = endTime - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = {
        timestamp,
        model: model.id,
        success: false,
        error: errorData.error?.message || `HTTP ${response.status}`,
        latency,
      };
      await logToFile(`errors_${new Date().toISOString().split("T")[0]}.jsonl`, error);
      console.log(`   ❌ FAILED: ${error.error} (${latency}ms)`);
      return { ...error, name: model.name };
    }

    const data = await response.json();
    const result = {
      timestamp,
      model: model.id,
      name: model.name,
      success: true,
      latency,
      usage: data.usage,
      finishReason: data.choices?.[0]?.finish_reason,
      contentLength: data.choices?.[0]?.message?.content?.length || 0,
      content: data.choices?.[0]?.message?.content || "[empty]",
    };

    // Log full result
    await logToFile(`test_${new Date().toISOString().split("T")[0]}.jsonl`, result);
    
    // Also save human-readable version
    const readable = `
=== ${model.name} (${model.id}) ===
Time: ${timestamp}
Latency: ${latency}ms
Tokens: ${JSON.stringify(data.usage)}
Finish Reason: ${data.choices?.[0]?.finish_reason}
Content Length: ${result.contentLength} chars

--- RESPONSE ---
${result.content.slice(0, 3000)}${result.content.length > 3000 ? "\n... [truncated]" : ""}

${"=".repeat(50)}
`;
    await fs.appendFile(
      path.join(APLOGS_DIR, `readable_${new Date().toISOString().split("T")[0]}.txt`),
      readable,
      "utf8"
    );

    console.log(`   ✅ SUCCESS (${latency}ms)`);
    console.log(`   📊 Tokens: prompt=${data.usage?.prompt_tokens}, completion=${data.usage?.completion_tokens}`);
    console.log(`   📝 Content: ${result.contentLength} chars, finish_reason: ${result.finishReason}`);
    
    return result;

  } catch (error) {
    const endTime = Date.now();
    const errorResult = {
      timestamp,
      model: model.id,
      success: false,
      error: error.message,
      latency: endTime - startTime,
    };
    await logToFile(`errors_${new Date().toISOString().split("T")[0]}.jsonl`, errorResult);
    console.log(`   ❌ ERROR: ${error.message}`);
    return { ...errorResult, name: model.name };
  }
}

// Main function
async function main() {
  console.log("🚀 OpenAI Vision Model Testing");
  console.log("================================\n");

  // Check API key
  if (!OPENAI_API_KEY) {
    console.error("❌ VITE_OPENAI_API_KEY not found in .env");
    process.exit(1);
  }
  console.log(`✅ API Key: ${OPENAI_API_KEY.slice(0, 10)}...${OPENAI_API_KEY.slice(-4)}`);

  // Check image exists
  try {
    await fs.access(IMAGE_PATH);
    console.log(`✅ Image: ${IMAGE_PATH}`);
  } catch {
    console.error(`❌ Image not found: ${IMAGE_PATH}`);
    process.exit(1);
  }

  // Setup logs
  await ensureAplogsDir();
  console.log(`✅ Logs: ${APLOGS_DIR}\n`);

  // Load and encode image
  const imageBuffer = await fs.readFile(IMAGE_PATH);
  const imageBase64 = imageBuffer.toString("base64");
  console.log(`✅ Image loaded: ${(imageBuffer.length / 1024).toFixed(1)}KB\n`);

  // Test all models
  console.log(`🧪 Testing ${MODELS.length} models...\n`);
  
  const results = [];
  for (const model of MODELS) {
    const result = await testModel(model, imageBase64);
    results.push(result);
    
    // Small delay between requests to avoid rate limits
    if (MODELS.indexOf(model) < MODELS.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Summary
  console.log("\n📊 SUMMARY");
  console.log("==========");
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✅ Successful: ${successful.length}/${MODELS.length}`);
  console.log(`❌ Failed: ${failed.length}/${MODELS.length}\n`);
  
  // Print comparison table
  console.log("Model Performance:");
  console.log("-".repeat(80));
  console.log("Model".padEnd(20), "Status".padEnd(10), "Latency".padEnd(12), "Tokens Used".padEnd(15), "Content");
  console.log("-".repeat(80));
  
  for (const r of results) {
    const status = r.success ? "✅ OK" : "❌ FAIL";
    const latency = r.success ? `${r.latency}ms` : "N/A";
    const tokens = r.success ? `${r.usage?.total_tokens || 0}` : "N/A";
    const content = r.success ? `${r.contentLength} chars` : r.error;
    
    console.log(
      r.name.padEnd(20),
      status.padEnd(10),
      latency.padEnd(12),
      tokens.padEnd(15),
      content.slice(0, 30)
    );
  }
  
  console.log("\n✨ All results saved to:", APLOGS_DIR);
  console.log("   - test_YYYY-MM-DD.jsonl (JSON data)");
  console.log("   - readable_YYYY-MM-DD.txt (Human readable)");
  console.log("   - errors_YYYY-MM-DD.jsonl (Errors only)");
}

main().catch(console.error);
