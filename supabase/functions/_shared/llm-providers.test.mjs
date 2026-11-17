import assert from "node:assert/strict";
import { test } from "node:test";

import { curateModels } from "./llm-providers.ts";

test("Groq only offers models with strict JSON Schema support", () => {
  const models = curateModels("groq", [
    "openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b", "meta-models/muse-spark-open",
    "llama-3.3-70b-versatile", "qwen/qwen3-32b", "openai/gpt-oss-safeguard-20b",
  ]);
  assert.deepEqual(models, [
    "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "meta-models/muse-spark-open",
  ]);
});

test("OpenAI only offers chat models that support JSON Schema output", () => {
  const models = curateModels("openai", [
    "gpt-3.5-turbo", "gpt-4", "gpt-4-turbo", "gpt-4o-2024-05-13", "gpt-4o-2024-08-06",
    "gpt-4o-mini", "gpt-4.1-mini", "gpt-5-mini", "gpt-5-pro", "gpt-3.5-turbo-instruct",
  ]);
  assert.deepEqual(models.sort(), ["gpt-4.1-mini", "gpt-4o-2024-08-06", "gpt-4o-mini", "gpt-5-mini"].sort());
});
