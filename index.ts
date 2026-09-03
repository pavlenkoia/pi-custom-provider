import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ProviderProfile = {
  id: string;
  providerId?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
};

type ConfigFile = {
  providers: ProviderProfile[];
};

type ProviderState = {
  runtimeProviderIds: string[];
};

type LegacyConfig = {
  baseUrl: string;
  apiKey: string;
  providerName?: string;
};

type RemoteModel = {
  id: string;
  name?: string;
  context_window?: number;
  context_length?: number;
  max_tokens?: number;
  max_output_tokens?: number;
  supports_reasoning?: boolean;
  supports_vision?: boolean;
  input_modalities?: string[];
  capabilities?: {
    reasoning?: boolean;
    thinking?: boolean;
    supportsThinking?: boolean;
    vision?: boolean;
    effort_tiers?: string[];
  };
};

/**
 * Resolve config/state paths through pi's own agent-dir resolution instead of
 * the extension process cwd. Extensions may run with an arbitrary cwd (whatever
 * directory pi was launched from), so anchoring to it would split saved data by
 * launch folder and break a fresh clone. Always use pi's global `~/.pi/agent`
 * (honouring pi's config-dir override) so providers persist across projects and
 * reload automatically on new clones.
 */
function resolveConfigPath(): string {
  return join(getAgentDir(), "custom-provider.json");
}

function resolveStatePath(): string {
  return join(getAgentDir(), "custom-provider-state.json");
}
const PROVIDER_ID_PREFIX = "custom-";
const LEGACY_PROVIDER_IDS = ["custom", "openai-http", "provider"];
const DEFAULT_PROVIDER_NAME = "Custom Provider";

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("URL must start with http:// or https://");
  }
  return trimmed;
}

function normalizeApiKey(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function createProfileId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

function slugifyProviderName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "provider";
}

function buildProviderId(name: string): string {
  return `${PROVIDER_ID_PREFIX}${slugifyProviderName(name)}`;
}

function ensureUniqueProviderIds(providers: ProviderProfile[]): ProviderProfile[] {
  const deduped = new Map<string, ProviderProfile>();
  for (const provider of providers) {
    const key = `${provider.name.trim().toLowerCase()}|${normalizeBaseUrl(provider.baseUrl)}|${normalizeApiKey(provider.apiKey)}`;
    if (!deduped.has(key)) {
      deduped.set(key, provider);
    }
  }

  const used = new Set<string>();
  return Array.from(deduped.values()).map((provider) => {
    const baseId = provider.providerId?.trim() || buildProviderId(provider.name);
    let providerId = baseId;
    let counter = 2;
    while (used.has(providerId)) {
      providerId = `${baseId}-${counter}`;
      counter += 1;
    }
    used.add(providerId);
    return { ...provider, providerId };
  });
}

function runtimeProviderId(profile: ProviderProfile): string {
  return profile.providerId?.trim() || buildProviderId(profile.name);
}

function readStore(): ConfigFile {
  if (!existsSync(resolveConfigPath())) return { providers: [] };
  const raw = readFileSync(resolveConfigPath(), "utf8");
  const parsed = JSON.parse(raw) as ConfigFile | LegacyConfig;

  if (Array.isArray((parsed as ConfigFile).providers)) {
    return {
      providers: ensureUniqueProviderIds((parsed as ConfigFile).providers
        .filter((provider): provider is ProviderProfile => Boolean(provider && provider.baseUrl && provider.apiKey))
        .map((provider) => ({
          id: provider.id?.trim() || createProfileId(),
          providerId: provider.providerId?.trim(),
          name: provider.name?.trim() || DEFAULT_PROVIDER_NAME,
          baseUrl: normalizeBaseUrl(provider.baseUrl),
          apiKey: normalizeApiKey(provider.apiKey),
        }))),
    };
  }

  const legacy = parsed as LegacyConfig;
  if (!legacy.baseUrl || !legacy.apiKey) return { providers: [] };
  return {
    providers: ensureUniqueProviderIds([{
      id: "legacy",
      providerId: buildProviderId(legacy.providerName?.trim() || DEFAULT_PROVIDER_NAME),
      name: legacy.providerName?.trim() || DEFAULT_PROVIDER_NAME,
      baseUrl: normalizeBaseUrl(legacy.baseUrl),
      apiKey: normalizeApiKey(legacy.apiKey),
    }]),
  };
}

function saveStore(store: ConfigFile): void {
  mkdirSync(dirname(resolveConfigPath()), { recursive: true });
  writeFileSync(
    resolveConfigPath(),
    `${JSON.stringify({
      providers: ensureUniqueProviderIds(store.providers).map((provider) => ({
        id: provider.id,
        providerId: provider.providerId,
        name: provider.name.trim() || DEFAULT_PROVIDER_NAME,
        baseUrl: normalizeBaseUrl(provider.baseUrl),
        apiKey: normalizeApiKey(provider.apiKey),
      })),
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

function readState(): ProviderState {
  if (!existsSync(resolveStatePath())) {
    return { runtimeProviderIds: [] };
  }

  try {
    const raw = readFileSync(resolveStatePath(), "utf8");
    const parsed = JSON.parse(raw) as ProviderState;
    return {
      runtimeProviderIds: Array.isArray(parsed.runtimeProviderIds)
        ? parsed.runtimeProviderIds.filter((id): id is string => typeof id === "string" && id.length > 0)
        : [],
    };
  } catch {
    return { runtimeProviderIds: [] };
  }
}

function saveState(state: ProviderState): void {
  mkdirSync(dirname(resolveStatePath()), { recursive: true });
  writeFileSync(
    resolveStatePath(),
    `${JSON.stringify({
      runtimeProviderIds: Array.from(new Set(state.runtimeProviderIds)),
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

function modelsUrl(baseUrl: string): string {
  return new URL("models", `${baseUrl}/`).toString();
}

async function fetchModels(baseUrl: string, apiKey: string): Promise<RemoteModel[]> {
  const response = await fetch(modelsUrl(baseUrl), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`GET /models failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    data?: RemoteModel[];
    models?: RemoteModel[];
  };

  const models = payload.data ?? payload.models ?? [];
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error(`No models found at ${modelsUrl(baseUrl)}`);
  }

  return models.filter((model): model is RemoteModel => Boolean(model && typeof model.id === "string" && model.id));
}

function registerProfile(pi: ExtensionAPI, profile: ProviderProfile, remoteModels: RemoteModel[]): void {
  pi.registerProvider(runtimeProviderId(profile), {
    name: profile.name,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    api: "openai-completions",
    models: remoteModels.map((model) => {
      const reasoning = Boolean(
        model.supports_reasoning
          ?? model.capabilities?.supportsThinking
          ?? model.capabilities?.thinking
          ?? model.capabilities?.reasoning,
      );
      const hasImageInput = Boolean(
        model.supports_vision
          ?? model.capabilities?.vision
          ?? model.input_modalities?.includes("image"),
      );
      const effortTiers = new Set(model.capabilities?.effort_tiers ?? []);
      const thinkingLevelMap = reasoning && effortTiers.size > 0
        ? {
            off: effortTiers.has("none") ? "none" : null,
            low: effortTiers.has("low") ? "low" : null,
            medium: effortTiers.has("medium") ? "medium" : null,
            high: effortTiers.has("high") ? "high" : null,
            xhigh: effortTiers.has("xhigh") ? "xhigh" : null,
            max: effortTiers.has("max") ? "max" : null,
          }
        : undefined;

      return {
        id: model.id,
        name: model.name ?? model.id,
        reasoning,
        ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
        input: hasImageInput ? (["text", "image"] as const) : (["text"] as const),
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: model.context_window ?? model.context_length ?? 128000,
        maxTokens: model.max_tokens ?? model.max_output_tokens ?? 8192,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: reasoning,
          supportsUsageInStreaming: false,
          maxTokensField: model.max_tokens ? "max_tokens" : "max_completion_tokens",
        },
      };
    }),
  });
}

function unregisterProfile(pi: ExtensionAPI, profile: ProviderProfile): void {
  pi.unregisterProvider(runtimeProviderId(profile));
}

function unregisterLegacyProviders(pi: ExtensionAPI): void {
  for (const legacyId of LEGACY_PROVIDER_IDS) {
    pi.unregisterProvider(legacyId);
  }
}

function unregisterKnownProviders(pi: ExtensionAPI, modelRegistry?: any): void {
  unregisterLegacyProviders(pi);

  const providerIds = new Set<string>(readState().runtimeProviderIds);

  if (modelRegistry?.getAll) {
    for (const model of modelRegistry.getAll()) {
      if (
        typeof model?.provider === "string" &&
        (model.provider.startsWith(PROVIDER_ID_PREFIX) || LEGACY_PROVIDER_IDS.includes(model.provider))
      ) {
        providerIds.add(model.provider);
      }
    }
  }

  const registeredProviders = modelRegistry?.registeredProviders;
  if (registeredProviders instanceof Map) {
    for (const providerId of registeredProviders.keys()) {
      if (
        typeof providerId === "string" &&
        (providerId.startsWith(PROVIDER_ID_PREFIX) || LEGACY_PROVIDER_IDS.includes(providerId))
      ) {
        providerIds.add(providerId);
      }
    }
  }

  for (const providerId of providerIds) {
    pi.unregisterProvider(providerId);
  }
}

function persistCurrentProviderIds(store: ConfigFile): void {
  saveState({
    runtimeProviderIds: store.providers.map((profile) => runtimeProviderId(profile)),
  });
}

async function loadAllProfiles(pi: ExtensionAPI, modelRegistry?: any): Promise<void> {
  unregisterKnownProviders(pi, modelRegistry);
  const store = readStore();
  saveStore(store);
  persistCurrentProviderIds(store);
  for (const profile of store.providers) {
    try {
      const remoteModels = await fetchModels(profile.baseUrl, profile.apiKey);
      registerProfile(pi, profile, remoteModels);
    } catch (error) {
      console.error(`[${runtimeProviderId(profile)}] startup load failed:`, error);
    }
  }
}

async function pickProfile(ctx: any, store: ConfigFile, title: string): Promise<ProviderProfile | undefined> {
  if (store.providers.length === 0) {
    ctx.ui.notify("No providers configured yet.", "info");
    return undefined;
  }

  if (store.providers.length === 1) return store.providers[0];

  const choice = await ctx.ui.select(
    title,
    store.providers.map((profile) => `${profile.name} — ${profile.baseUrl}`),
  );
  if (!choice) return undefined;
  return store.providers.find((profile) => `${profile.name} — ${profile.baseUrl}` === choice);
}

async function promptForProfile(ctx: any, current?: ProviderProfile): Promise<ProviderProfile | undefined> {
  const name = await ctx.ui.input("Provider name", current?.name ?? DEFAULT_PROVIDER_NAME);
  if (!name) return undefined;

  const baseUrl = await ctx.ui.input("OpenAI-compatible base URL", current?.baseUrl ?? "http://127.0.0.1:8000/v1");
  if (!baseUrl) return undefined;

  const apiKeyPrompt = current
    ? "API key (leave empty to keep current)"
    : "API key";
  const apiKeyInput = await ctx.ui.input(apiKeyPrompt, current ? "" : "");
  if (apiKeyInput === undefined) return undefined;

  const apiKey = normalizeApiKey(apiKeyInput || current?.apiKey || "");
  if (!apiKey) {
    ctx.ui.notify("API key is required", "error");
    return undefined;
  }

  return {
    id: current?.id ?? createProfileId(),
    providerId: current?.providerId,
    name: name.trim(),
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
  };
}

async function addProvider(pi: ExtensionAPI, ctx: any): Promise<void> {
  const profile = await promptForProfile(ctx);
  if (!profile) {
    ctx.ui.notify("Setup cancelled", "info");
    return;
  }

  try {
    const remoteModels = await fetchModels(profile.baseUrl, profile.apiKey);
    const store = readStore();
    const existing = store.providers.find((provider) =>
      provider.name.trim().toLowerCase() === profile.name.trim().toLowerCase() &&
      provider.baseUrl === profile.baseUrl,
    );

    if (existing) {
      const updated = { ...existing, apiKey: profile.apiKey };
      store.providers = store.providers.map((provider) => provider.id === existing.id ? updated : provider);
      saveStore(store);
      persistCurrentProviderIds(store);
      unregisterProfile(pi, existing);
      registerProfile(pi, updated, remoteModels);
      ctx.ui.notify(`Updated ${updated.name}. Loaded ${remoteModels.length} model(s).`, "info");
      return;
    }

    store.providers.push(profile);
    saveStore(store);
    persistCurrentProviderIds(store);
    registerProfile(pi, profile, remoteModels);
    ctx.ui.notify(`Added ${profile.name}. Loaded ${remoteModels.length} model(s).`, "info");
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
  }
}

async function editProvider(pi: ExtensionAPI, ctx: any): Promise<void> {
  const store = readStore();
  const current = await pickProfile(ctx, store, "Select provider to edit");
  if (!current) return;

  const updated = await promptForProfile(ctx, current);
  if (!updated) {
    ctx.ui.notify("Edit cancelled", "info");
    return;
  }

  try {
    const remoteModels = await fetchModels(updated.baseUrl, updated.apiKey);
    const nextStore = readStore();
    nextStore.providers = nextStore.providers.map((profile) => profile.id === current.id ? updated : profile);
    saveStore(nextStore);
    persistCurrentProviderIds(nextStore);
    unregisterProfile(pi, current);
    registerProfile(pi, updated, remoteModels);
    ctx.ui.notify(`Updated ${updated.name}. Loaded ${remoteModels.length} model(s).`, "info");
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
  }
}

async function removeProvider(pi: ExtensionAPI, ctx: any): Promise<void> {
  const store = readStore();
  const profile = await pickProfile(ctx, store, "Select provider to delete");
  if (!profile) return;

  const ok = await ctx.ui.confirm("Delete provider?", `Remove ${profile.name} (${profile.baseUrl})?`);
  if (!ok) return;

  const nextStore = readStore();
  nextStore.providers = nextStore.providers.filter((item) => item.id !== profile.id);
  saveStore(nextStore);
  persistCurrentProviderIds(nextStore);
  unregisterProfile(pi, profile);
  ctx.ui.notify(`Deleted ${profile.name}.`, "info");
}

async function refreshProvider(pi: ExtensionAPI, ctx: any, profile?: ProviderProfile): Promise<void> {
  const store = readStore();
  const target = profile ?? await pickProfile(ctx, store, "Select provider to refresh");
  if (!target) return;

  try {
    const remoteModels = await fetchModels(target.baseUrl, target.apiKey);
    unregisterProfile(pi, target);
    registerProfile(pi, target, remoteModels);
    ctx.ui.notify(`Refreshed ${target.name}. Loaded ${remoteModels.length} model(s).`, "info");
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
  }
}

async function refreshAllProviders(pi: ExtensionAPI, ctx: any): Promise<void> {
  const store = readStore();
  if (store.providers.length === 0) {
    ctx.ui.notify("No providers configured yet.", "info");
    return;
  }

  const results: string[] = [];
  for (const profile of store.providers) {
    try {
      const remoteModels = await fetchModels(profile.baseUrl, profile.apiKey);
      unregisterProfile(pi, profile);
      registerProfile(pi, profile, remoteModels);
      results.push(`✓ ${profile.name}: ${remoteModels.length} model(s)`);
    } catch (error) {
      results.push(`✗ ${profile.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  ctx.ui.notify(results.join("\n"), "info");
}

function providerSummary(store: ConfigFile): string {
  if (store.providers.length === 0) {
    return `No config yet. Run /provider`;
  }

  return store.providers
    .map((profile, index) => `${index + 1}. ${profile.name}\n   ${profile.baseUrl}\n   id: ${runtimeProviderId(profile)}`)
    .join("\n\n");
}

async function providerMenu(pi: ExtensionAPI, ctx: any): Promise<void> {
  const action = await ctx.ui.select("Provider manager", [
    "Add provider",
    "Edit provider",
    "Refresh provider",
    "Refresh all providers",
    "Delete provider",
    "List providers",
  ]);

  switch (action) {
    case "Add provider":
      await addProvider(pi, ctx);
      return;
    case "Edit provider":
      await editProvider(pi, ctx);
      return;
    case "Refresh provider":
      await refreshProvider(pi, ctx);
      return;
    case "Refresh all providers":
      await refreshAllProviders(pi, ctx);
      return;
    case "Delete provider":
      await removeProvider(pi, ctx);
      return;
    case "List providers":
      ctx.ui.notify(providerSummary(readStore()), "info");
      return;
    default:
      return;
  }
}

export default async function customProvider(pi: ExtensionAPI) {
  const runtimeModelRegistry = (pi as any).modelRegistry;
  await loadAllProfiles(pi, runtimeModelRegistry);

  pi.registerCommand("provider", {
    description: "Manage custom OpenAI-compatible providers",
    handler: async (_args, ctx) => {
      await providerMenu(pi, ctx);
    },
  });

  pi.registerCommand("provider-status", {
    description: "List configured custom providers",
    handler: async (_args, ctx) => {
      ctx.ui.notify(providerSummary(readStore()), "info");
    },
  });

  pi.registerCommand("provider-purge", {
    description: "Force-remove all runtime custom providers and stale custom models",
    handler: async (_args, ctx) => {
      unregisterKnownProviders(pi, ctx.modelRegistry);
      rmSync(resolveStatePath(), { force: true });
      ctx.ui.notify("Purged all runtime custom providers. Reopen /model or restart pi if the selector is already open.", "info");
    },
  });
}
