"use client";

import { useState, useTransition } from "react";

import type { AiConfigPublic, AiProviderId } from "@/lib/firebase/types";

import { saveAiConfigAction } from "./ai-actions";

const PROVIDERS: { value: AiProviderId; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google (Gemini)" },
  { value: "anthropic", label: "Anthropic" },
  { value: "custom", label: "Custom" },
];

export function AiModelSettings({ initial }: { initial: AiConfigPublic }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [provider, setProvider] = useState<AiProviderId>(initial.provider);
  const [name, setName] = useState(initial.name);
  const [modelId, setModelId] = useState(initial.model_id);
  const [apiKey, setApiKey] = useState("");
  const [hint, setHint] = useState(initial.api_key_hint);
  const [keySet, setKeySet] = useState(initial.api_key_set);

  const submit = () => {
    startTransition(async () => {
      const res = await saveAiConfigAction({
        provider,
        name,
        model_id: modelId,
        api_key: apiKey,
      });
      if (!res.ok) {
        setToast({ kind: "err", text: res.error });
        return;
      }
      if (res.config) {
        setHint(res.config.api_key_hint);
        setKeySet(res.config.api_key_set);
        setApiKey("");
      }
      setToast({ kind: "ok", text: "AI settings updated." });
    });
  };

  return (
    <>
      <section className="card p-4 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">AI Model</h2>
            <p className="mt-1 text-xs text-[--color-muted]">
              Configure the vision model used for AI Analysis (Super Admin only).
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setToast(null);
              setOpen(true);
            }}
            className="rounded-md border border-violet-400/50 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-500/25"
          >
            Add / Update AI Model
          </button>
        </div>
        {(keySet || name) && (
          <p className="mt-3 text-xs text-slate-400">
            Active: <span className="text-slate-200">{name || "—"}</span>
            {modelId ? ` · ${modelId}` : ""}
            {hint ? ` · key ${hint}` : ""}
          </p>
        )}
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="card w-full max-w-md space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">AI Model Settings</h3>
                <p className="mt-1 text-xs text-[--color-muted]">
                  Provider, display name, model ID, and API key.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                Close
              </button>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-300">AI Provider</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as AiProviderId)}
                className="input"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-300">AI Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="e.g. Ring Vision"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-300">Model ID</span>
              <input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="input"
                placeholder="e.g. gpt-4o / gemini-2.0-flash"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-300">API Key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="input"
                placeholder={keySet ? `Leave blank to keep ${hint ?? "existing key"}` : "sk-…"}
                autoComplete="off"
              />
            </label>

            {toast ? (
              <p className={toast.kind === "ok" ? "text-xs text-emerald-300" : "text-xs text-red-300"}>
                {toast.text}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={submit}
                className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save AI Settings"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
