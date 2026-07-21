/**
 * Mermaid to Image Converter
 * Client-side Mermaid diagram rendering and export.
 * Uses global `mermaid` object from CDN script tag.
 */

(function () {
    'use strict';

    // ─── Elements ───────────────────────────────────────────────────────────

    const input = document.getElementById('mermaid-input');
    const preview = document.getElementById('mermaid-preview');
    const placeholder = document.getElementById('placeholder-text');
    const errorDisplay = document.getElementById('error-display');
    const themeSelect = document.getElementById('theme-select');
    const bgSelect = document.getElementById('bg-select');
    const scaleInput = document.getElementById('scale-input');

    const btnExample = document.getElementById('btn-example');
    const btnClear = document.getElementById('btn-clear');
    const btnSvg = document.getElementById('btn-svg');
    const btnPng = document.getElementById('btn-png');
    const btnJpeg = document.getElementById('btn-jpeg');
    const btnClipboard = document.getElementById('btn-clipboard');

    // ─── State ──────────────────────────────────────────────────────────────

    let currentSvg = null;
    let renderTimeout = null;
    let renderCounter = 0;

    // ─── Mermaid Init ───────────────────────────────────────────────────────

    function initMermaid(theme) {
        mermaid.initialize({
            startOnLoad: false,
            theme: theme || 'default',
            securityLevel: 'loose',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        });
    }

    initMermaid('default');

    // ─── Rendering ──────────────────────────────────────────────────────────

    async function renderDiagram() {
        const code = input.value.trim();

        if (!code) {
            preview.innerHTML = '';
            placeholder.classList.remove('hidden');
            errorDisplay.classList.add('hidden');
            currentSvg = null;
            setExportEnabled(false);
            return;
        }

        try {
            // Use a unique ID for each render to avoid conflicts
            renderCounter++;
            const id = 'mermaid-diagram-' + renderCounter;

            const { svg } = await mermaid.render(id, code);

            preview.innerHTML = svg;
            placeholder.classList.add('hidden');
            errorDisplay.classList.add('hidden');
            currentSvg = svg;
            setExportEnabled(true);
        } catch (err) {
            const msg = err.message || err.str || String(err);
            errorDisplay.textContent = msg;
            errorDisplay.classList.remove('hidden');
            preview.innerHTML = '';
            placeholder.classList.add('hidden');
            currentSvg = null;
            setExportEnabled(false);

            // Mermaid sometimes leaves error elements in the DOM
            const errorEl = document.getElementById('d' + (renderCounter));
            if (errorEl) errorEl.remove();
        }
    }

    function setExportEnabled(enabled) {
        btnSvg.disabled = !enabled;
        btnPng.disabled = !enabled;
        btnJpeg.disabled = !enabled;
        btnClipboard.disabled = !enabled;
    }

    function debounceRender() {
        clearTimeout(renderTimeout);
        renderTimeout = setTimeout(renderDiagram, 500);
    }

    // ─── Export Functions ────────────────────────────────────────────────────

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function getSvgWithBackground() {
        if (!currentSvg) return null;

        const bg = bgSelect.value;
        if (bg === 'transparent') return currentSvg;

        // Inject background rect into SVG
        const parser = new DOMParser();
        const doc = parser.parseFromString(currentSvg, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');

        if (svgEl) {
            const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('width', '100%');
            rect.setAttribute('height', '100%');
            rect.setAttribute('fill', bg);
            svgEl.insertBefore(rect, svgEl.firstChild);
        }

        return new XMLSerializer().serializeToString(doc);
    }

    function exportSvg() {
        const svg = getSvgWithBackground();
        if (!svg) return;

        const blob = new Blob([svg], { type: 'image/svg+xml' });
        downloadBlob(blob, 'diagram.svg');
    }

    function exportRaster(format) {
        const svg = getSvgWithBackground() || currentSvg;
        if (!svg) return;

        const scale = parseInt(scaleInput.value) || 2;

        // Create image from SVG
        const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();

        img.onload = function () {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth * scale;
            canvas.height = img.naturalHeight * scale;

            const ctx = canvas.getContext('2d');

            // Fill background for JPEG (no transparency support)
            if (format === 'jpeg') {
                const bg = bgSelect.value;
                ctx.fillStyle = (bg === 'transparent') ? 'white' : bg;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0);

            URL.revokeObjectURL(url);

            const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
            const quality = format === 'jpeg' ? 0.92 : undefined;

            canvas.toBlob(function (blob) {
                if (blob) {
                    downloadBlob(blob, 'diagram.' + format);
                }
            }, mimeType, quality);
        };

        img.onerror = function () {
            URL.revokeObjectURL(url);
            console.error('Failed to load SVG as image for raster export');
        };

        img.src = url;
    }

    function copyToClipboard() {
        const svg = getSvgWithBackground();
        if (!svg) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(svg).then(function () {
                flashButton(btnClipboard, '✅ Copied!', '📋 Copy SVG');
            }).catch(function () {
                fallbackCopy(svg);
            });
        } else {
            fallbackCopy(svg);
        }
    }

    function fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        flashButton(btnClipboard, '✅ Copied!', '📋 Copy SVG');
    }

    function flashButton(btn, tempText, originalText) {
        btn.textContent = tempText;
        setTimeout(function () { btn.textContent = originalText; }, 2000);
    }

    // ─── Example Diagram ────────────────────────────────────────────────────

    var EXAMPLE = [
        'flowchart TD',
        '    subgraph Intake["1. Project Intake"]',
        '        FORM["ML Ops Intake Form"]',
        '        SCOPE["Define Scope"]',
        '        TEAMS["Assign Teams"]',
        '    end',
        '',
        '    subgraph DataEng["2. Data Engineering"]',
        '        RAW["Raw Sources"] --> STG["Staging (STG_*)"]',
        '        STG --> INT["Intermediate (INT_*)"]',
        '        INT --> FEAT["Feature Table (RPT_*)"]',
        '    end',
        '',
        '    subgraph Model["3. Model Development"]',
        '        TRAIN["Train Model"]',
        '        EVAL["Evaluate"]',
        '        REGISTER["Register in SRMR"]',
        '    end',
        '',
        '    subgraph Prod["4. Production"]',
        '        RETRAIN["Nightly Retraining"]',
        '        COMPARE["Compare vs Baseline"]',
        '        SERVE["Serve Predictions"]',
        '    end',
        '',
        '    FORM --> SCOPE --> TEAMS',
        '    TEAMS --> RAW',
        '    FEAT --> TRAIN --> EVAL --> REGISTER',
        '    REGISTER --> RETRAIN --> COMPARE --> SERVE',
    ].join('\n');

    // ─── Event Listeners ────────────────────────────────────────────────────

    input.addEventListener('input', debounceRender);

    themeSelect.addEventListener('change', function () {
        initMermaid(themeSelect.value);
        renderDiagram();
    });

    bgSelect.addEventListener('change', function () {
        var container = document.getElementById('preview-container');
        var bg = bgSelect.value;
        container.style.backgroundColor = bg === 'transparent' ? 'white' : bg;
    });

    btnExample.addEventListener('click', function () {
        input.value = EXAMPLE;
        renderDiagram();
    });

    btnClear.addEventListener('click', function () {
        input.value = '';
        renderDiagram();
        input.focus();
    });

    btnSvg.addEventListener('click', exportSvg);
    btnPng.addEventListener('click', function () { exportRaster('png'); });
    btnJpeg.addEventListener('click', function () { exportRaster('jpeg'); });
    btnClipboard.addEventListener('click', copyToClipboard);

    // ─── Keyboard Shortcuts ─────────────────────────────────────────────────

    document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(renderTimeout);
            renderDiagram();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            if (currentSvg) exportSvg();
        }
    });

    // ─── Init ───────────────────────────────────────────────────────────────

    if (input.value.trim()) {
        renderDiagram();
    }

})();
