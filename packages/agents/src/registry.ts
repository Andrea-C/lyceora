import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { splitRef, type ModelsConfig, type ProviderConfig } from "./config";

export interface ModelCandidate { ref: string; provider: string; modelId: string; model: LanguageModel }
export type ModelFactory = (modelId: string) => LanguageModel;
export type ProviderFactories = Record<ProviderConfig["api_mode"], (p: ProviderConfig, name: string) => ModelFactory>;

const defaultFactories: ProviderFactories = {
  anthropic_messages: (p) => {
    const c = createAnthropic({ apiKey: process.env[p.api_key_env], baseURL: p.base_url });
    return (id) => c(id);
  },
  openai_responses: (p) => {
    const c = createOpenAI({ apiKey: process.env[p.api_key_env], baseURL: p.base_url });
    return (id) => c(id);
  },
  gemini: (p) => {
    const c = createGoogleGenerativeAI({ apiKey: process.env[p.api_key_env], baseURL: p.base_url });
    return (id) => c(id);
  },
  chat_completions: (p, name) => {
    const c = createOpenAICompatible({ name, apiKey: process.env[p.api_key_env], baseURL: p.base_url ?? "" });
    return (id) => c(id);
  }
};

/** Retryable = the provider is unhealthy for us. Non-retryable = the request itself is wrong. */
export function isFailoverError(err: unknown): boolean {
  const status = (err as { statusCode?: number })?.statusCode;
  if (status === 401 || status === 402 || status === 403 || status === 408 || status === 429) return true;
  if (status !== undefined && status >= 500) return true;
  if (status !== undefined) return false;
  if ((err as Error)?.name === "AbortError") return true;
  const msg = String((err as Error)?.message ?? "").toLowerCase();
  return /timeout|etimedout|econnrefused|econnreset|fetch failed|enotfound|eai_again|ehostunreach|epipe|aborted/.test(msg);
}

export interface Registry {
  resolve(role: string): ModelCandidate[];
  withFallback<T>(role: string, fn: (m: ModelCandidate) => Promise<T>): Promise<T>;
}

export function createRegistry(config: ModelsConfig, factories: ProviderFactories = defaultFactories): Registry {
  const providerFns = new Map<string, ModelFactory>();
  for (const [name, p] of Object.entries(config.providers)) {
    providerFns.set(name, factories[p.api_mode](p, name));
  }
  const toCandidate = (ref: string): ModelCandidate => {
    const { provider, modelId } = splitRef(ref);
    const make = providerFns.get(provider);
    if (!make) throw new Error(`Unknown provider '${provider}' in ref ${ref}`);
    return { ref, provider, modelId, model: make(modelId) };
  };
  const resolve = (role: string): ModelCandidate[] => {
    const spec = config.agents[role] ?? config.task_slots[role] ?? {};
    if (spec.model) return [toCandidate(spec.model)];
    const tier = spec.tier ?? config.defaults.tier;
    const refs = config.tiers[tier];
    if (!refs) throw new Error(`Unknown tier '${tier}' for role ${role}`);
    return refs.map(toCandidate);
  };
  return {
    resolve,
    async withFallback(role, fn) {
      const chain = resolve(role);
      let lastErr: unknown;
      for (const candidate of chain) {
        try {
          return await fn(candidate);
        } catch (err) {
          if (!isFailoverError(err)) throw err;
          lastErr = err;
        }
      }
      throw lastErr;
    }
  };
}
