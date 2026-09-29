/**
 * LLM Service for Generating Mermaid Diagrams
 *
 * Supports Ollama (local/remote), Google Gemini, and OpenAI-compatible endpoints.
 *
 * Provider/model resolution is runtime-configurable via the config store
 * (configStore.js): when a request does not pin an explicit provider, the
 * currently *active* provider config — chosen in the Settings UI and persisted
 * to disk — is used. This means the model/provider can change without editing
 * env vars or redeploying.
 *
 * Resolution order for provider/model/config on each call:
 *   1. Explicit args passed by the caller (provider, model, config.{endpoint,apiKey})
 *   2. The active config from the store (base_url, api_key, active_model)
 *   3. Env-var defaults (DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL, OLLAMA_HOST, ...)
 */

const store = require('./configStore');

const SYSTEM_PROMPT = `You are an expert system architect and visual communicator.
Analyze the user's description of a system, process, interaction, or relationship.
Determine the most appropriate types of diagrams (e.g., flowchart, sequence diagram, entity relationship diagram, state diagram, class diagram, timeline, git graph, pie chart, user journey, gantt chart, mindmap) to represent the use-case.
Choose between 1 to 3 relevant diagram types.

Output your response in the following format:

# Executive Summary
[Provide a concise 2-3 sentence overview of the system architecture or domain described in the user prompt]

# Architectural Rationale
[Explain the LLM reasoning behind choosing these specific diagram types to visualize the system and how they complement each other]

For each diagram, you must output a section in the following format:

### Diagram Name
Type: flowchart (or sequence, er, state, class, etc.)
Description: Brief explanation of what this diagram illustrates and why this type was chosen.
\`\`\`mermaid
[mermaid code]
\`\`\`

Do not output any conversational introduction or conclusion outside the sections specified above.`;

// ─── Runtime resolution ──────────────────────────────────────────────────────

/**
 * Resolve the effective provider/model/endpoint/apiKey for a request.
 *
 * Explicit caller args win; otherwise fall back to the active stored config;
 * finally to env-var defaults. Returns a normalized shape the provider branches
 * consume directly.
 */
function resolveConfig(provider, model, config = {}) {
    const active = safeActiveConfig();

    const prov = (provider || (active && active.provider_type) || process.env.DEFAULT_LLM_PROVIDER || 'ollama')
        .toLowerCase();

    // Only inherit the stored model when the resolved provider matches the
    // active config's provider — otherwise a mismatched (provider, model) pair
    // could leak through (e.g. an Ollama model name sent to Gemini).
    const activeModelForProv = active && active.provider_type === prov ? active.active_model : '';
    const mdl = model || activeModelForProv || process.env.DEFAULT_LLM_MODEL || defaultModelFor(prov);

    const activeBaseForProv = active && active.provider_type === prov ? active.base_url : '';
    const activeKeyForProv = active && active.provider_type === prov ? active.api_key : '';

    return {
        provider: prov,
        model: mdl,
        endpoint: config.endpoint || activeBaseForProv || defaultEndpointFor(prov),
        apiKey: config.apiKey || activeKeyForProv || envKeyFor(prov),
    };
}

function safeActiveConfig() {
    try {
        return store.getActiveConfig();
    } catch (err) {
        return null;
    }
}

function defaultModelFor(prov) {
    if (prov === 'ollama') return 'gemma3:12b';
    if (prov === 'google') return 'gemini-1.5-flash';
    if (prov === 'openai') return 'gpt-4o-mini';
    return '';
}

function defaultEndpointFor(prov) {
    if (prov === 'ollama') return process.env.OLLAMA_HOST || 'http://localhost:11434';
    if (prov === 'google') return 'https://generativelanguage.googleapis.com/v1beta';
    if (prov === 'openai') return 'https://api.openai.com/v1';
    return '';
}

function envKeyFor(prov) {
    if (prov === 'google') return process.env.GEMINI_API_KEY || '';
    if (prov === 'openai') return process.env.OPENAI_API_KEY || '';
    return '';
}

// ─── Generation ───────────────────────────────────────────────────────────────

async function generateDiagrams(prompt, provider, model, config = {}) {
    const r = resolveConfig(provider, model, config);
    const settings = safeSettings();
    const temperature = settings.temperature ?? 0.2;
    const maxTokens = settings.max_tokens ?? 4096;

    const userContent = `User Request: "${prompt}"`;
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${userContent}`;

    if (r.provider === 'ollama') {
        const url = `${trimSlash(r.endpoint)}/api/generate`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: r.model,
                prompt: fullPrompt,
                stream: false,
                options: { temperature, num_predict: maxTokens },
            }),
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Ollama request failed: ${response.statusText}. ${errText}`);
        }
        const data = await response.json();
        return parseResponse(data.response, prompt, r.provider, r.model);
    }

    if (r.provider === 'google') {
        if (!r.apiKey) throw new Error('Gemini API Key is not configured.');
        const base = trimSlash(r.endpoint) || 'https://generativelanguage.googleapis.com/v1beta';
        const url = `${base}/models/${r.model}:generateContent?key=${r.apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: fullPrompt }] }],
                generationConfig: { temperature, maxOutputTokens: maxTokens },
            }),
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini request failed: ${response.statusText}. ${errText}`);
        }
        const data = await response.json();
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts[0]) {
            throw new Error('Invalid response from Gemini API.');
        }
        return parseResponse(data.candidates[0].content.parts[0].text, prompt, r.provider, r.model);
    }

    if (r.provider === 'openai') {
        if (!r.apiKey) throw new Error('OpenAI API Key is not configured.');
        const url = `${trimSlash(r.endpoint)}/chat/completions`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${r.apiKey}`,
            },
            body: JSON.stringify({
                model: r.model,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userContent },
                ],
                temperature,
                max_tokens: maxTokens,
            }),
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI request failed: ${response.statusText}. ${errText}`);
        }
        const data = await response.json();
        const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!text) throw new Error('Invalid response from OpenAI-compatible API.');
        return parseResponse(text, prompt, r.provider, r.model);
    }

    throw new Error(`Unsupported LLM provider: ${r.provider}`);
}

function safeSettings() {
    try {
        return store.getSettings() || {};
    } catch (err) {
        return {};
    }
}

function trimSlash(s) {
    return (s || '').replace(/\/+$/, '');
}

// ─── Parsing (unchanged behavior) ──────────────────────────────────────────────

function parseResponse(text, userPrompt = '', provider = '', model = '') {
    const diagrams = [];

    // Extract Executive Summary
    let summary = '';
    const summaryMatch = text.match(/#+\s*Executive Summary\s*\n([\s\S]*?)(?=#+\s*Architectural Rationale|###|\n#|$)/i);
    if (summaryMatch) {
        summary = summaryMatch[1].trim();
    }

    // Extract Architectural Rationale / LLM Reasoning
    let reasoning = '';
    const reasoningMatch = text.match(/#+\s*Architectural Rationale\s*\n([\s\S]*?)(?=###|\n#|$)/i);
    if (reasoningMatch) {
        reasoning = reasoningMatch[1].trim();
    }

    // Split the text into diagram sections by ### headers
    const sections = text.split(/###\s+/);

    for (let i = 1; i < sections.length; i++) {
        const section = sections[i].trim();
        if (!section) continue;

        // Extract Name (first line of the section)
        const nameLine = section.split('\n')[0].trim();
        if (/Executive Summary|Architectural Rationale/i.test(nameLine)) continue;

        // Extract Type using regex
        const typeMatch = section.match(/Type:\s*([a-zA-Z0-9_\-]+)/i);
        const type = typeMatch ? typeMatch[1].trim() : 'flowchart';

        // Extract Description using regex
        const descMatch = section.match(/Description:\s*([^\n]+)/i);
        const description = descMatch ? descMatch[1].trim() : '';

        // Extract Mermaid block
        const mermaidMatch = section.match(/```mermaid([\s\S]*?)```/);
        const code = mermaidMatch ? mermaidMatch[1].trim() : '';

        if (code) {
            diagrams.push({
                id: `generated-diagram-${i}`,
                name: nameLine,
                type: type,
                description: description,
                code: code,
            });
        }
    }

    if (diagrams.length === 0) {
        // Fallback: If it still outputted JSON despite the prompt, try parsing as JSON
        try {
            let cleanText = text.trim();
            const firstBrace = cleanText.indexOf('{');
            const lastBrace = cleanText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleanText = cleanText.substring(firstBrace, lastBrace + 1);
                const parsed = JSON.parse(cleanText);
                let diagramsArray = null;
                if (Array.isArray(parsed)) {
                    diagramsArray = parsed;
                } else if (parsed && typeof parsed === 'object') {
                    if (Array.isArray(parsed.diagrams)) {
                        diagramsArray = parsed.diagrams;
                    } else {
                        for (const key in parsed) {
                            if (Array.isArray(parsed[key])) {
                                diagramsArray = parsed[key];
                                break;
                            }
                        }
                    }
                }

                if (diagramsArray) {
                    const parsedDiagrams = diagramsArray.map((d, idx) => ({
                        id: d.id || `generated-diagram-${idx + 1}`,
                        name: d.name || 'Generated Diagram',
                        type: d.type || 'flowchart',
                        description: d.description || '',
                        code: d.code || d.mermaid || '',
                    }));
                    return buildReportObject(parsedDiagrams, parsed.summary || summary, parsed.reasoning || reasoning, userPrompt, provider, model);
                }
            }
        } catch (e) {
            // Ignore
        }

        console.error('Failed to parse response text:', text);
        throw new Error('Could not extract any valid Mermaid diagrams from the model response. Please check terminal logs.');
    }

    return buildReportObject(diagrams, summary, reasoning, userPrompt, provider, model);
}

function buildReportObject(diagrams, summary, reasoning, userPrompt, provider, model) {
    const formattedSummary = summary || `Architectural and process diagrams generated based on user requirements: "${userPrompt}".`;
    const formattedReasoning = reasoning || `The diagrams selected illustrate key structural, interaction, or procedural views to convey system architecture effectively.`;

    const reportLines = [
        `# Architectural Diagram Report`,
        ``,
        `- **User Prompt:** ${userPrompt}`,
        `- **LLM Provider:** ${provider || 'N/A'}`,
        `- **Model:** ${model || 'N/A'}`,
        `- **Generated Date:** ${new Date().toLocaleString()}`,
        ``,
        `---`,
        ``,
        `## Executive Summary`,
        ``,
        formattedSummary,
        ``,
        `## Architectural Rationale & Reasoning`,
        ``,
        formattedReasoning,
        ``,
        `---`,
        ``,
        `## Generated Diagrams`,
        ``,
    ];

    diagrams.forEach((d, idx) => {
        reportLines.push(`### ${idx + 1}. ${d.name} (\`${d.type}\`)`);
        if (d.description) {
            reportLines.push(`**Description:** ${d.description}`);
            reportLines.push(``);
        }
        reportLines.push(`\`\`\`mermaid`);
        reportLines.push(d.code);
        reportLines.push(`\`\`\``);
        reportLines.push(``);
    });

    return {
        summary: formattedSummary,
        reasoning: formattedReasoning,
        diagrams: diagrams,
        reportMarkdown: reportLines.join('\n'),
    };
}

// ─── Status + Model Discovery ──────────────────────────────────────────────────

async function checkStatus(provider, model, config = {}) {
    const r = resolveConfig(provider, model, config);

    if (r.provider === 'ollama') {
        try {
            const response = await fetch(`${trimSlash(r.endpoint)}/api/tags`);
            if (!response.ok) {
                return { available: false, reason: `Ollama server returned status ${response.status}` };
            }
            const data = await response.json();
            const models = data.models || [];

            const exists = models.some((m) => {
                const name = m.name.toLowerCase();
                const target = r.model.toLowerCase();
                return name === target || name.split(':')[0] === target || target.split(':')[0] === name;
            });

            if (exists) {
                return { available: true, reason: `Model '${r.model}' is available on Ollama.` };
            }
            const availableModels = models.map((m) => m.name).join(', ') || 'none';
            return {
                available: false,
                reason: `Ollama is running, but model '${r.model}' was not found. Available models: ${availableModels}. Use 'ollama pull ${r.model}' to download it.`,
            };
        } catch (err) {
            return { available: false, reason: `Could not connect to Ollama at ${r.endpoint}. Make sure Ollama is running.` };
        }
    }

    if (r.provider === 'google') {
        if (!r.apiKey) {
            return { available: false, reason: 'Gemini API Key is not configured.' };
        }
        try {
            const base = trimSlash(r.endpoint) || 'https://generativelanguage.googleapis.com/v1beta';
            const response = await fetch(`${base}/models?key=${r.apiKey}`);
            if (!response.ok) {
                return { available: false, reason: `Gemini API key is invalid or request failed with status ${response.status}.` };
            }
            return { available: true, reason: `Gemini API is ready. Model '${r.model}' will be called.` };
        } catch (err) {
            return { available: false, reason: `Failed to reach Gemini API: ${err.message}` };
        }
    }

    if (r.provider === 'openai') {
        if (!r.apiKey) {
            return { available: false, reason: 'OpenAI API Key is not configured.' };
        }
        try {
            const response = await fetch(`${trimSlash(r.endpoint)}/models`, {
                headers: { Authorization: `Bearer ${r.apiKey}` },
            });
            if (!response.ok) {
                return { available: false, reason: `OpenAI-compatible endpoint returned status ${response.status}.` };
            }
            return { available: true, reason: `OpenAI-compatible endpoint is ready. Model '${r.model}' will be called.` };
        } catch (err) {
            return { available: false, reason: `Failed to reach OpenAI-compatible endpoint: ${err.message}` };
        }
    }

    return { available: false, reason: `Unknown provider: ${r.provider}` };
}

/**
 * Probe a provider endpoint and return reachability + discovered model list.
 * Used by the Settings "Test Connection" action to populate model dropdowns.
 *
 * Returns: { status: 'online'|'offline', message, latency_ms, models: string[] }
 */
async function discoverModels(provider, config = {}) {
    const prov = (provider || 'ollama').toLowerCase();
    const endpoint = config.endpoint || defaultEndpointFor(prov);
    const apiKey = config.apiKey || envKeyFor(prov);
    const start = Date.now();

    try {
        if (prov === 'ollama') {
            const response = await fetch(`${trimSlash(endpoint)}/api/tags`);
            if (!response.ok) {
                return offline(`Ollama server returned status ${response.status}`, start);
            }
            const data = await response.json();
            const models = (data.models || []).map((m) => m.name).sort();
            return online(`Ollama reachable — ${models.length} model(s) found.`, start, models);
        }

        if (prov === 'google') {
            if (!apiKey) return offline('Gemini API Key is not configured.', start);
            const base = trimSlash(endpoint) || 'https://generativelanguage.googleapis.com/v1beta';
            const response = await fetch(`${base}/models?key=${apiKey}`);
            if (!response.ok) {
                return offline(`Gemini request failed with status ${response.status}.`, start);
            }
            const data = await response.json();
            const models = (data.models || [])
                .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
                .map((m) => String(m.name || '').replace(/^models\//, ''))
                .filter(Boolean)
                .sort();
            return online(`Gemini reachable — ${models.length} model(s) found.`, start, models);
        }

        if (prov === 'openai') {
            if (!apiKey) return offline('API Key is not configured.', start);
            const response = await fetch(`${trimSlash(endpoint)}/models`, {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (!response.ok) {
                return offline(`Endpoint returned status ${response.status}.`, start);
            }
            const data = await response.json();
            const list = Array.isArray(data.data) ? data.data : [];
            const models = list.map((m) => m.id).filter(Boolean).sort();
            return online(`Endpoint reachable — ${models.length} model(s) found.`, start, models);
        }

        return offline(`Unknown provider: ${prov}`, start);
    } catch (err) {
        return offline(`Connection failed: ${err.message}`, start);
    }
}

function online(message, start, models) {
    return { status: 'online', message, latency_ms: Date.now() - start, models };
}

function offline(message, start) {
    return { status: 'offline', message, latency_ms: Date.now() - start, models: [] };
}

module.exports = {
    generateDiagrams,
    checkStatus,
    discoverModels,
    resolveConfig,
};
