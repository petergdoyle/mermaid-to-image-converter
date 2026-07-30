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

const express = require('express');
const path = require('path');
const archiver = require('archiver');
const { render, renderToRaster, generateThumbnail, closeBrowser } = require('./renderer');

const PORT = process.env.PORT || 3200;

const app = express();
app.use(express.text({ type: 'text/plain', limit: '1mb' }));
app.use(express.json({ limit: '10mb' }));

// Serve the static browser UI
app.use('/ui', express.static(path.join(__dirname, '..')));

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
