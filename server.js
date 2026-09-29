/**
 * Mermaid-to-Image Conversion API
 *
 * Endpoints:
 *   GET  /health           — Liveness check
 *   POST /convert          — Single diagram → image
 *   POST /convert/batch    — Multiple diagrams → zip
 *
 * Also serves the static browser UI at /ui (index.html + app.js + style.css)
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const archiver = require('archiver');
const { render, renderToRaster, generateThumbnail, closeBrowser } = require('./renderer');
const { generateDiagrams, checkStatus, discoverModels } = require('./llmService');
const store = require('./configStore');

// Never leak stored API keys back to the browser — mask them in list responses.
function maskConfig(cfg) {
    return { ...cfg, api_key: cfg.api_key ? '••••••••' : '', has_api_key: !!cfg.api_key };
}

const PORT = process.env.PORT || 3200;

const app = express();
app.use(express.text({ type: 'text/plain', limit: '1mb' }));
app.use(express.json({ limit: '10mb' }));

// Serve the static browser UI
app.use('/ui', express.static(path.join(__dirname, 'html')));

// ─── Health ─────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'mermaid-to-image-api' });
});

// ─── Single Conversion ──────────────────────────────────────────────────────

app.post('/convert', async (req, res) => {
    try {
        const mmdContent = req.body;
        if (!mmdContent || typeof mmdContent !== 'string' || !mmdContent.trim()) {
            return res.status(400).json({ error: 'Request body must be Mermaid diagram text' });
        }

        const format = (req.headers['x-format'] || 'svg').toLowerCase();
        const theme = req.headers['x-theme'] || 'neutral';
        const background = req.headers['x-background'] || 'white';
        const scale = parseInt(req.headers['x-scale']) || 2;
        const filename = req.headers['x-filename'] || 'diagram';

        const validFormats = ['svg', 'png', 'jpeg'];
        if (!validFormats.includes(format)) {
            return res.status(400).json({ error: `Invalid format. Use: ${validFormats.join(', ')}` });
        }

        const result = await render(mmdContent, { format, theme, background, scale });

        const ext = format === 'jpeg' ? 'jpg' : format;
        const mimeTypes = { svg: 'image/svg+xml', png: 'image/png', jpeg: 'image/jpeg' };

        res.setHeader('Content-Type', mimeTypes[format]);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.${ext}"`);

        if (format === 'svg') {
            res.send(result);
        } else {
            res.send(result);
        }
    } catch (err) {
        console.error('Conversion error:', err.message);
        res.status(500).json({ error: 'Rendering failed', detail: err.message });
    }
});

// ─── Batch Conversion ───────────────────────────────────────────────────────

app.post('/convert/batch', async (req, res) => {
    try {
        const { diagrams } = req.body;
        if (!Array.isArray(diagrams) || diagrams.length === 0) {
            return res.status(400).json({ error: 'Body must have "diagrams" array with {name, content} objects' });
        }

        const format = (req.headers['x-format'] || 'svg').toLowerCase();
        const theme = req.headers['x-theme'] || 'neutral';
        const background = req.headers['x-background'] || 'white';
        const scale = parseInt(req.headers['x-scale']) || 2;
        const withThumbnails = req.headers['x-thumbnails'] !== 'false';

        const ext = format === 'jpeg' ? 'jpg' : format;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="diagrams.zip"');

        const archive = archiver('zip', { zlib: { level: 6 } });
        archive.pipe(res);

        for (const diagram of diagrams) {
            const name = diagram.name || 'diagram';
            const content = diagram.content;

            if (!content) continue;

            try {
                const result = await render(content, { format, theme, background, scale });

                if (format === 'svg') {
                    archive.append(result, { name: `${name}.${ext}` });
                } else {
                    archive.append(result, { name: `${name}.${ext}` });
                    // Add thumbnail
                    if (withThumbnails) {
                        const thumb = await generateThumbnail(result, { width: 400, format });
                        archive.append(thumb, { name: `${name}_thumb.${ext}` });
                    }
                }
            } catch (err) {
                // Include error as text file in the zip
                archive.append(`Error: ${err.message}`, { name: `${name}_ERROR.txt` });
            }
        }

        await archive.finalize();
    } catch (err) {
        console.error('Batch error:', err.message);
        res.status(500).json({ error: 'Batch rendering failed', detail: err.message });
    }
});

// ─── AI Diagram Generation ──────────────────────────────────────────────────

app.post('/api/llm/generate', async (req, res) => {
    try {
        const { prompt, provider, model, config } = req.body;
        if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
            return res.status(400).json({ error: 'Request body must contain a "prompt" string.' });
        }

        const result = await generateDiagrams(prompt, provider, model, config);
        res.json(result);
    } catch (err) {
        console.error('LLM Diagram generation error:', err.message);
        res.status(500).json({ error: 'LLM Diagram generation failed', detail: err.message });
    }
});

app.post('/api/llm/status', async (req, res) => {
    try {
        const { provider, model, config } = req.body;
        const result = await checkStatus(provider, model, config);
        res.json(result);
    } catch (err) {
        console.error('LLM Status check error:', err.message);
        res.status(500).json({ error: 'LLM Status check failed', detail: err.message });
    }
});

// ─── LLM Provider Settings ──────────────────────────────────────────────────
// Runtime-configurable provider registry + active selection. Changes here take
// effect for the next /api/llm/generate call — no restart or redeploy needed.

// List all provider configs (API keys masked).
app.get('/api/llm/configs', (req, res) => {
    try {
        res.json(store.listConfigs().map(maskConfig));
    } catch (err) {
        console.error('List configs error:', err.message);
        res.status(500).json({ error: 'Failed to list provider configs', detail: err.message });
    }
});

// Save or update a provider config. A masked/blank api_key is treated as
// "keep the existing key" so the UI never has to re-enter it.
app.post('/api/llm/configs', (req, res) => {
    try {
        const body = req.body || {};
        if (!body.id || typeof body.id !== 'string') {
            return res.status(400).json({ error: 'Config "id" is required.' });
        }
        const incomingKey = typeof body.api_key === 'string' ? body.api_key : '';
        const isMasked = incomingKey === '' || /^[•*]+$/.test(incomingKey);
        if (isMasked) {
            // Preserve the stored key rather than overwriting with the mask.
            const existing = store.getConfig(body.id);
            body.api_key = existing ? existing.api_key : '';
        }
        const saved = store.upsertConfig(body);
        res.json(maskConfig(saved));
    } catch (err) {
        console.error('Save config error:', err.message);
        res.status(500).json({ error: 'Failed to save provider config', detail: err.message });
    }
});

// Delete a provider config.
app.delete('/api/llm/configs/:id', (req, res) => {
    try {
        const removed = store.deleteConfig(req.params.id);
        res.json({ status: removed ? 'deleted' : 'not_found', id: req.params.id });
    } catch (err) {
        console.error('Delete config error:', err.message);
        res.status(500).json({ error: 'Failed to delete provider config', detail: err.message });
    }
});

// Set the active provider + model (this is what generation uses by default).
app.post('/api/llm/active', (req, res) => {
    try {
        const { config_id, active_model } = req.body || {};
        if (!config_id) {
            return res.status(400).json({ error: '"config_id" is required.' });
        }
        const active = store.setActive(config_id, active_model);
        res.json({ status: 'active', config_id, model: active ? active.active_model : active_model });
    } catch (err) {
        console.error('Set active error:', err.message);
        res.status(404).json({ error: 'Failed to set active provider', detail: err.message });
    }
});

// Test a provider connection and discover its available models. When a
// config_id is supplied, unspecified fields fall back to the stored config
// (and a masked/blank api_key reuses the stored key).
app.post('/api/llm/test', async (req, res) => {
    try {
        const body = req.body || {};
        const stored = body.config_id ? store.getConfig(body.config_id) : null;

        const provider = body.provider_type || (stored && stored.provider_type) || 'ollama';
        const endpoint = body.base_url || (stored && stored.base_url) || '';

        let apiKey = typeof body.api_key === 'string' ? body.api_key : '';
        const isMasked = apiKey === '' || /^[•*]+$/.test(apiKey);
        if (isMasked) apiKey = stored ? stored.api_key : '';

        const result = await discoverModels(provider, { endpoint, apiKey });

        // Persist discovered models + status onto the stored config so the
        // dropdowns reflect reality on the next load (ClassPilot behavior).
        if (stored) {
            store.upsertConfig({
                id: stored.id,
                status: result.status,
                available_models: result.models && result.models.length ? result.models : stored.available_models,
            });
        }

        res.json(result);
    } catch (err) {
        console.error('Test connection error:', err.message);
        res.status(500).json({ error: 'Connection test failed', detail: err.message });
    }
});

// Reset all provider configs back to seeded defaults.
app.post('/api/llm/reseed', (req, res) => {
    try {
        const configs = store.replaceAll();
        res.json({ status: 'reseeded', count: configs.length });
    } catch (err) {
        console.error('Reseed error:', err.message);
        res.status(500).json({ error: 'Failed to reseed configs', detail: err.message });
    }
});

// App-level generation settings (temperature, max tokens).
app.get('/api/llm/settings', (req, res) => {
    try {
        res.json(store.getSettings());
    } catch (err) {
        res.status(500).json({ error: 'Failed to load settings', detail: err.message });
    }
});

app.put('/api/llm/settings', (req, res) => {
    try {
        res.json(store.setSettings(req.body || {}));
    } catch (err) {
        res.status(500).json({ error: 'Failed to save settings', detail: err.message });
    }
});

// ─── Start ──────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
    console.log(`\n  🧜‍♀️ Mermaid-to-Image API running`);
    console.log(`  ─────────────────────────────────`);
    console.log(`  API:    http://localhost:${PORT}`);
    console.log(`  UI:     http://localhost:${PORT}/ui`);
    console.log(`  Health: http://localhost:${PORT}/health`);
    console.log(`  ─────────────────────────────────\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await closeBrowser();
    server.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await closeBrowser();
    server.close();
    process.exit(0);
});
