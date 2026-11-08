"use client";

import { useEffect, useState } from "react";

import { labelClass, softInputClass } from "@/components/AuthShell";
import { invokeFn } from "@/lib/functions";
import type { LlmProvider, UserLlmKey } from "@/lib/types";

const PROVIDERS: { id: LlmProvider; name: string; blurb: string; keyUrl: string; keyLabel: string }[] = [
  { id: "groq", name: "Groq", blurb: "Fast and inexpensive", keyUrl: "https://console.groq.com/keys", keyLabel: "console.groq.com/keys" },
  { id: "openai", name: "OpenAI", blurb: "GPT models", keyUrl: "https://platform.openai.com/api-keys", keyLabel: "platform.openai.com/api-keys" },
  { id: "anthropic", name: "Anthropic", blurb: "Claude models", keyUrl: "https://console.anthropic.com/settings/keys", keyLabel: "console.anthropic.com/settings/keys" },
];

export const providerName = (p: LlmProvider) => PROVIDERS.find((x) => x.id === p)?.name ?? p;

interface SaveResponse {
  provider: LlmProvider;
  model: string;
  resumed?: string;
}

export function LlmKeyForm({ llmKey, onChanged }: { llmKey: UserLlmKey | null; onChanged: () => void }) {
  const connected = !!llmKey;
  const [replacing, setReplacing] = useState(false);
  const [provider, setProvider] = useState<LlmProvider>(llmKey?.provider ?? "groq");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const showForm = !connected || replacing;
  const needsModel = llmKey?.status === "model_unavailable";
  const [refreshing, setRefreshing] = useState(false);

  const refreshModels = async () => {
    setRefreshing(true);
    setError(null);
    const { error: fnError } = await invokeFn("save-llm-key", { refresh_models: true });
    setRefreshing(false);
    if (fnError) setError(fnError);
    else {
      setNotice("Model list updated.");
      onChanged();
    }
  };

  // A retired model means the stored list is stale: fetch the current one once.
  useEffect(() => {
    if (needsModel) void refreshModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsModel]);
  const chosen = PROVIDERS.find((p) => p.id === provider)!;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const { data, error: fnError } = await invokeFn<SaveResponse>("save-llm-key", { provider, api_key: apiKey });
    setBusy(false);
    if (fnError || !data) {
      setError(fnError ?? "Could not check your key. Try again.");
      return;
    }
    setApiKey("");
    setReplacing(false);
    setNotice(
      data.resumed === "cv"
        ? `Connected to ${providerName(data.provider)}. We are reading your CV now.`
        : data.resumed === "match"
          ? `Connected to ${providerName(data.provider)}. We are scoring openings for you now.`
          : `Connected to ${providerName(data.provider)} using ${data.model}.`,
    );
    onChanged();
  };

  const changeModel = async (model: string) => {
    setError(null);
    const { error: fnError } = await invokeFn("save-llm-key", { model });
    if (fnError) setError(fnError);
    else {
      setNotice(`Now using ${model}.`);
      onChanged();
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove your AI key? Your existing matches stay, but no new ones are scored until you add a key.")) return;
    setError(null);
    const { error: fnError } = await invokeFn("save-llm-key", { remove: true });
    if (fnError) setError(fnError);
    else {
      setNotice("Key removed.");
      onChanged();
    }
  };

  return (
    <div>
      {connected && (
        <div className="mb-5 rounded-2xl bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-bold">
                {providerName(llmKey.provider)}{" "}
                <span className={`ml-1 rounded-full px-3 py-0.5 text-sm ${llmKey.status === "valid" ? "bg-brand text-white" : "border-2 border-black text-black"}`}>
                  {llmKey.status === "valid" ? "Connected" : needsModel ? "Choose a new model" : "Needs a new key"}
                </span>
              </p>
              <p className="text-base text-black/70">Using {llmKey.model}</p>
              {llmKey.status !== "valid" && llmKey.status_message && <p className="mt-1 text-base">{llmKey.status_message}</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setReplacing((v) => !v)} className="rounded-lg bg-brand-soft px-4 py-2 text-base font-bold text-brand transition-colors hover:bg-brand-mid">
                {replacing ? "Cancel" : "Replace key"}
              </button>
              <button type="button" onClick={remove} className="rounded-lg border-2 border-brand px-4 py-1.5 text-base font-bold text-brand transition-colors hover:bg-brand hover:text-white">
                Remove
              </button>
            </div>
          </div>
          {(llmKey.available_models.length > 1 || needsModel) && llmKey.status !== "invalid" && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between gap-3">
                <label htmlFor="llm-model" className="text-base font-bold">
                  Model
                </label>
                <button type="button" onClick={refreshModels} disabled={refreshing} className="text-sm font-bold text-brand underline disabled:opacity-60">
                  {refreshing ? "Refreshing..." : "Refresh list"}
                </button>
              </div>
              <select
                id="llm-model"
                value={needsModel ? "" : llmKey.model}
                onChange={(e) => e.target.value && changeModel(e.target.value)}
                className={`w-full rounded-lg border-2 bg-white px-3 py-2 text-lg outline-none focus:border-brand ${needsModel ? "border-brand" : "border-brand-mid"}`}
              >
                {needsModel && (
                  <option value="" disabled>
                    Choose a model
                  </option>
                )}
                {llmKey.available_models.map((m, i) => (
                  <option key={m} value={m}>
                    {m}
                    {i === 0 ? " (recommended)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-black/60">
                Only chat models are listed. Smaller models cost less, and you pay your provider for every opening we score.
              </p>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={save}>
          <fieldset className="mb-5">
            <legend className={labelClass}>Provider</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {PROVIDERS.map((p) => (
                <label key={p.id} className={`cursor-pointer rounded-xl border-2 p-3 transition-colors ${provider === p.id ? "border-brand bg-white" : "border-transparent bg-white/60 hover:bg-white"}`}>
                  <input type="radio" name="provider" value={p.id} checked={provider === p.id} onChange={() => setProvider(p.id)} className="sr-only" />
                  <span className="block text-lg font-bold">{p.name}</span>
                  <span className="block text-sm text-black/70">{p.blurb}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor="llm-key" className={labelClass}>
            {chosen.name} API key
          </label>
          <input id="llm-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your key" className={`${softInputClass} mb-1`} />
          <p className="mb-5 text-sm text-black/60">
            Create one at{" "}
            <a href={chosen.keyUrl} target="_blank" rel="noreferrer" className="font-bold text-brand underline">
              {chosen.keyLabel}
            </a>
            .
          </p>

          {error && (
            <p role="alert" className="mb-4 rounded-lg bg-white px-4 py-3 text-base font-bold text-black">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || apiKey.trim().length < 20} className="w-full rounded-xl bg-brand py-3 text-lg font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50 sm:w-auto sm:px-8">
            {busy ? "Checking your key..." : "Save and check key"}
          </button>
        </form>
      )}

      {notice && !showForm && (
        <p role="status" className="mt-4 rounded-lg bg-white px-4 py-3 text-base text-brand-deep">
          {notice}
        </p>
      )}
      {!showForm && error && (
        <p role="alert" className="mt-4 rounded-lg bg-white px-4 py-3 text-base font-bold">
          {error}
        </p>
      )}

      <ul className="mt-5 space-y-1.5 text-sm text-black/70">
        <li>Your key is encrypted before it is stored and is never shown again.</li>
        <li>It is used only to read your CV and score openings for you. You pay your provider directly.</li>
        <li>We score up to 40 openings per batch, so costs stay predictable.</li>
        <li>Your CV text is sent to the provider you choose.</li>
      </ul>
    </div>
  );
}
