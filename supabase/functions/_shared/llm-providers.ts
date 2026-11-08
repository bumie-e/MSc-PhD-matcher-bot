// Provider checks for bring-your-own-key. Validating means asking the provider
// for its model list with the user's key: it proves the key works without
// spending any of their credit, and tells us which models they can use.
//
// Providers list everything they host (embeddings, speech, image, moderation,
// dated snapshots, ...). We keep only models that suit this app's one job, text
// generation through the chat API, and put the recommended one first.

export type Provider = "groq" | "openai" | "anthropic";

export const PROVIDERS: Provider[] = ["groq", "openai", "anthropic"];

const NAME: Record<Provider, string> = { groq: "Groq", openai: "OpenAI", anthropic: "Anthropic" };

const MODEL_LIST_URL: Record<Provider, string> = {
  groq: "https://api.groq.com/openai/v1/models",
  openai: "https://api.openai.com/v1/models",
  anthropic: "https://api.anthropic.com/v1/models?limit=100",
};

// Most options a user is shown. Enough choice, not a catalogue.
export const MAX_MODELS = 8;

export class KeyRejected extends Error {}
export class ProviderUnavailable extends Error {}

function authHeaders(provider: Provider, apiKey: string): HeadersInit {
  return provider === "anthropic"
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : { Authorization: `Bearer ${apiKey}` };
}

// Never useful for chat/text generation, whichever provider lists them.
const NOT_TEXT_GENERATION =
  /(embed|whisper|tts|transcribe|speech|audio|realtime|image|dall-e|sora|moderation|guard|safeguard|search|codex|davinci|babbage|computer-use|orpheus|playai|compound|deep-research|-pro$|preview-tts|vision-preview|ocr|rerank|translate)/i;

// Provider-specific "this is a general chat model" check.
const IS_CHAT_MODEL: Record<Provider, RegExp> = {
  // GPT family only. The o-series reasoning models spend their output budget thinking,
  // which is a poor fit for strict JSON.
  openai: /^(gpt-|chatgpt)/i,
  anthropic: /^claude-/i,
  groq: /^(openai\/gpt-oss|llama|meta-llama\/|qwen|moonshotai\/|deepseek|gemma|mistral|mixtral|allam|kimi)/i,
};

// Dated copies of a model ("gpt-4o-2024-08-06", "claude-x-20250929") clutter the
// list. Drop one when its undated alias is also available.
function dropDatedSnapshots(ids: string[]): string[] {
  const set = new Set(ids);
  const datedSuffix = /-(\d{4}-\d{2}-\d{2}|\d{8}|\d{4})$/;
  return ids.filter((id) => {
    const alias = id.replace(datedSuffix, "");
    return alias === id || !set.has(alias);
  });
}

const newestFirst = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });

// Order models best-default-first for this app. Newest-looking first within a tier.
const TIERS: Record<Provider, RegExp[]> = {
  groq: [/^openai\/gpt-oss-120b$/, /^openai\/gpt-oss-20b$/, /llama.*70b/i, /llama/i, /qwen/i],
  anthropic: [/haiku/i, /sonnet/i, /opus/i],
  // A small, inexpensive tier first so the user's bill stays low.
  openai: [/-mini$/i, /-nano$/i, /^gpt-[\d.]+$/i],
};

// OpenAI's "-instruct" models only work with the legacy completions API, not chat.
// (On Groq, "-instruct" models are normal chat models.)
const OPENAI_COMPLETIONS_ONLY = /instruct/i;

/** Reduce a provider's raw model list to the chat models worth offering, best default first. */
export function curateModels(provider: Provider, ids: string[]): string[] {
  const chat = ids.filter(
    (id) =>
      IS_CHAT_MODEL[provider].test(id) &&
      !NOT_TEXT_GENERATION.test(id) &&
      !(provider === "openai" && OPENAI_COMPLETIONS_ONLY.test(id)),
  );
  const unique = dropDatedSnapshots([...new Set(chat)]);

  const placed = new Set<string>();
  const ordered: string[] = [];
  for (const tier of TIERS[provider]) {
    for (const id of unique.filter((m) => tier.test(m)).sort(newestFirst)) {
      if (!placed.has(id)) {
        placed.add(id);
        ordered.push(id);
      }
    }
  }
  ordered.push(...unique.filter((m) => !placed.has(m)).sort(newestFirst));
  return ordered.slice(0, MAX_MODELS);
}

export async function listChatModels(provider: Provider, apiKey: string): Promise<string[]> {
  let resp: Response;
  try {
    resp = await fetch(MODEL_LIST_URL[provider], { headers: authHeaders(provider, apiKey) });
  } catch {
    throw new ProviderUnavailable(`Could not reach ${NAME[provider]}. Try again in a moment.`);
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new KeyRejected(`${NAME[provider]} rejected this key. Check that you copied all of it.`);
  }
  if (!resp.ok) {
    throw new ProviderUnavailable(`${NAME[provider]} returned an error (HTTP ${resp.status}). Try again in a moment.`);
  }
  const body = await resp.json();
  const ids: string[] = (body.data ?? []).map((m: { id: string }) => m.id).filter(Boolean);
  return curateModels(provider, ids);
}

// The first curated model is the recommended default.
export function pickDefaultModel(_provider: Provider, models: string[]): string | null {
  return models[0] ?? null;
}
