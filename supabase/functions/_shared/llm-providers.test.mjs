import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { KeyRejected, curateModels, listChatModels, pickDefaultModel } from "./llm-providers.ts";

test("Gemini models are normalized, filtered, deduplicated, and ordered by cost tier", () => {
  const models = curateModels("gemini", [
    "models/gemini-3.8-pro", "models/gemini-3.8-flash", "gemini-3.8-flash",
    "models/gemini-3.1-flash-lite", "models/gemini-embedding-001",
    "models/gemini-2.5-flash-image", "models/gemini-live-2.5-flash",
  ]);
  assert.deepEqual(models, ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.8-pro"]);
  assert.equal(pickDefaultModel("gemini", models), "gemini-3.1-flash-lite");
});

test("DeepSeek defaults to Flash and supports legacy chat models", () => {
  const models = curateModels("deepseek", [
    "deepseek-v4-pro", "deepseek-reasoner", "deepseek-chat", "deepseek-flash", "other-model",
  ]);
  assert.deepEqual(models, ["deepseek-flash", "deepseek-chat", "deepseek-v4-pro", "deepseek-reasoner"]);
  assert.equal(pickDefaultModel("deepseek", models), "deepseek-flash");
});

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

for (const [provider, url, id] of [
  ["gemini", "https://generativelanguage.googleapis.com/v1beta/openai/models", "gemini-3.8-flash"],
  ["deepseek", "https://api.deepseek.com/models", "deepseek-flash"],
]) {
  test(`${provider} validates keys with its own model-list endpoint`, async () => {
    const fetchMock = mock.method(globalThis, "fetch", async (requestedUrl, options) => {
      assert.equal(requestedUrl, url);
      assert.equal(options.headers.Authorization, "Bearer test-key");
      return Response.json({ data: [{ id }] });
    });
    try {
      assert.deepEqual(await listChatModels(provider, "test-key"), [id]);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test(`${provider} rejects invalid keys without leaking provider error bodies`, async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      Response.json({ error: { message: "PRIVATE_PROVIDER_TEXT" } }, { status: 401 }));
    try {
      await assert.rejects(() => listChatModels(provider, "test-key"), (error) => {
        assert.ok(error instanceof KeyRejected);
        assert.ok(!error.message.includes("PRIVATE_PROVIDER_TEXT"));
        return true;
      });
    } finally {
      fetchMock.mock.restore();
    }
  });
}
