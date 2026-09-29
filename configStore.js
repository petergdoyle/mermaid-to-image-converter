/**
 * Config Store — persistent LLM provider registry + active selection.
 *
 * This is the runtime-configuration layer for the AI Generator. Instead of the
 * provider/model being fixed in env vars (which required a redeploy to change),
 * provider configs and the active provider/model live in a JSON file on disk and
 * are re-read at generation time. Editing them via the Settings UI takes effect
 * immediately for subsequent generations — no restart, no redeploy.
 *
 * Modeled on ClassPilot's ConfigStore: a small set of provider "configs", one
 * marked active at a time, seeded with sensible defaults if the store is empty.
 *
 * Persistence: a single JSON file. Path resolution order:
 *   1. LLM_CONFIG_PATH env var (absolute or relative to cwd)
 *   2. ./data/llm-config.json (default)
 *
 * Shape on disk:
 *   {
 *     "configs": [ LLMProviderConfig, ... ],
 *     "settings": { ...app settings blob... }
 *   }
 *
 * LLMProviderConfig:
 *   {
 *     id: string,               // stable key, e.g. "ollama_local"
 *     name: string,             // display name
 *     provider_type: "ollama" | "google" | "openai",
 *     base_url: string,         // endpoint (ollama host / openai-compatible base)
 *     api_key: string,          // stored key (blank for ollama)
 *     active_model: string,     // currently selected model for this provider
 *     is_active: boolean,       // exactly one config is the system-active one
 *     status: "online" | "offline" | "unconfigured",
 *     available_models: string[] // discovered via Test Connection
 *   }
 */

const fs = require('fs');
const path = require('path');

// ─── File location ────────────────────────────────────────────────────────────

function configPath() {
    const custom = process.env.LLM_CONFIG_PATH;
    if (custom && custom.trim()) {
        return path.isAbsolute(custom) ? custom : path.join(process.cwd(), custom);
    }
    return path.join(process.cwd(), 'data', 'llm-config.json');
}

// ─── Seed defaults ──────────────────────────────────────────────────────────
// First-boot state honors the environment (DEFAULT_LLM_PROVIDER, OLLAMA_HOST,
// GEMINI_API_KEY, ...) so an existing .env keeps working. After the first save
// the JSON file is authoritative.

function defaultConfigs() {
    const envProvider = (process.env.DEFAULT_LLM_PROVIDER || 'ollama').toLowerCase();
    const envModel = process.env.DEFAULT_LLM_MODEL || '';

    return [
        {
            id: 'ollama_local',
            name: 'Ollama (Local)',
            provider_type: 'ollama',
            base_url: process.env.OLLAMA_HOST || 'http://localhost:11434',
            api_key: '',
            active_model: envProvider === 'ollama' && envModel ? envModel : 'gemma3:12b',
            is_active: envProvider === 'ollama',
            status: 'unconfigured',
            available_models: [],
        },
        {
            id: 'ollama_remote',
            name: 'Ollama (Remote)',
            provider_type: 'ollama',
            base_url: 'http://192.168.20.11:11434',
            api_key: '',
            active_model: 'gemma3:12b',
            is_active: false,
            status: 'unconfigured',
            available_models: [],
        },
        {
            id: 'google',
            name: 'Google Gemini',
            provider_type: 'google',
            base_url: 'https://generativelanguage.googleapis.com/v1beta',
            api_key: process.env.GEMINI_API_KEY || '',
            active_model: envProvider === 'google' && envModel ? envModel : 'gemini-1.5-flash',
            is_active: envProvider === 'google',
            status: 'unconfigured',
            available_models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
        },
        {
            id: 'openai',
            name: 'OpenAI (or compatible)',
            provider_type: 'openai',
            base_url: 'https://api.openai.com/v1',
            api_key: process.env.OPENAI_API_KEY || '',
            active_model: envProvider === 'openai' && envModel ? envModel : 'gpt-4o-mini',
            is_active: envProvider === 'openai',
            status: 'unconfigured',
            available_models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1-mini'],
        },
    ];
}

function defaultSettings() {
    return {
        // Reserved for future app-level toggles (kept for parity with ClassPilot).
        temperature: 0.2,
        max_tokens: 4096,
    };
}

function ensureSingleActive(configs) {
    // Preserve the single-active invariant: if none/many are active, pick the
    // first active one (or the first config) and clear the rest.
    const activeIdx = configs.findIndex((c) => c.is_active);
    const chosen = activeIdx >= 0 ? activeIdx : 0;
    configs.forEach((c, i) => {
        c.is_active = i === chosen;
    });
    return configs;
}

// ─── Load / persist ───────────────────────────────────────────────────────────

function readRaw() {
    const file = configPath();
    try {
        const text = fs.readFileSync(file, 'utf8');
        const data = JSON.parse(text);
        if (data && Array.isArray(data.configs)) {
            return {
                configs: data.configs,
                settings: data.settings && typeof data.settings === 'object' ? data.settings : defaultSettings(),
            };
        }
    } catch (err) {
        // Missing or corrupt file → fall through to seed.
    }
    return null;
}

function writeRaw(state) {
    const file = configPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Load the store, seeding defaults on first use (or if the file is missing/corrupt).
 * Always returns a well-formed { configs, settings } object.
 */
function load() {
    const existing = readRaw();
    if (existing && existing.configs.length > 0) {
        ensureSingleActive(existing.configs);
        return existing;
    }
    const seeded = { configs: ensureSingleActive(defaultConfigs()), settings: defaultSettings() };
    writeRaw(seeded);
    return seeded;
}

function save(state) {
    ensureSingleActive(state.configs);
    writeRaw(state);
    return state;
}

// ─── Public API (mirrors ClassPilot's ConfigStore) ──────────────────────────

function listConfigs() {
    const { configs } = load();
    // Active-first, then by name — matches ClassPilot ordering.
    return [...configs].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

function getConfig(configId) {
    const { configs } = load();
    return configs.find((c) => c.id === configId) || null;
}

function getActiveConfig() {
    const { configs } = load();
    return configs.find((c) => c.is_active) || configs[0] || null;
}

/**
 * Insert or replace a provider config (keyed on id). Unknown fields are ignored;
 * missing fields fall back to the existing row (or sensible blanks for a new one).
 */
function upsertConfig(cfg) {
    const state = load();
    const idx = state.configs.findIndex((c) => c.id === cfg.id);
    const base = idx >= 0 ? state.configs[idx] : {
        id: cfg.id,
        name: cfg.id,
        provider_type: 'ollama',
        base_url: '',
        api_key: '',
        active_model: '',
        is_active: false,
        status: 'unconfigured',
        available_models: [],
    };
    const merged = {
        ...base,
        ...pick(cfg, [
            'name',
            'provider_type',
            'base_url',
            'api_key',
            'active_model',
            'status',
            'available_models',
        ]),
        id: base.id,
        // is_active is only changed via setActive to protect the invariant.
        is_active: base.is_active,
    };
    if (idx >= 0) state.configs[idx] = merged;
    else state.configs.push(merged);
    save(state);
    return merged;
}

function deleteConfig(configId) {
    const state = load();
    const before = state.configs.length;
    state.configs = state.configs.filter((c) => c.id !== configId);
    if (state.configs.length !== before) save(state);
    return before - state.configs.length;
}

/**
 * Deactivate every config, then activate exactly configId. When activeModel is
 * given it is written onto the activated row.
 */
function setActive(configId, activeModel) {
    const state = load();
    let found = false;
    state.configs.forEach((c) => {
        if (c.id === configId) {
            c.is_active = true;
            found = true;
            if (activeModel) c.active_model = activeModel;
        } else {
            c.is_active = false;
        }
    });
    if (!found) {
        throw new Error(`Provider config '${configId}' not found`);
    }
    save(state);
    return getActiveConfig();
}

function replaceAll() {
    const seeded = { configs: ensureSingleActive(defaultConfigs()), settings: defaultSettings() };
    writeRaw(seeded);
    return seeded.configs;
}

function getSettings() {
    return load().settings;
}

function setSettings(partial) {
    const state = load();
    state.settings = { ...state.settings, ...(partial || {}) };
    save(state);
    return state.settings;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function pick(obj, keys) {
    const out = {};
    if (!obj) return out;
    keys.forEach((k) => {
        if (obj[k] !== undefined) out[k] = obj[k];
    });
    return out;
}

module.exports = {
    configPath,
    listConfigs,
    getConfig,
    getActiveConfig,
    upsertConfig,
    deleteConfig,
    setActive,
    replaceAll,
    getSettings,
    setSettings,
};
