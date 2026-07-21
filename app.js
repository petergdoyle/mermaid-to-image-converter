/**
 * Mermaid to Image Converter
 * Client-side Mermaid diagram rendering and export.
 */

import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

// ─── Elements ───────────────────────────────────────────────────────────────

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

// ─── State ──────────────────────────────────────────────────────────────────

let currentSvg = null;
let renderTimeout = null;

// ─── Mermaid Init ───────────────────────────────────────────────────────────

function initMermaid(theme = 'default') {
    mermaid.initialize({
        startOnLoad: false,
        theme: theme,
        securityLevel: 'loose',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });
}

initMermaid();

// ─── Rendering ──────────────────────────────────────────────────────────────

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
        // Validate syntax first
        await mermaid.parse(code);

        // Render
        const id = 'mermaid-' + Date.now();
        const { svg } = await mermaid.render(id, code);

        preview.innerHTML = svg;
        placeholder.classList.add('hidden');
        errorDisplay.classList.add('hidden');
        currentSvg = svg;
        setExportEnabled(true);
    } catch (err) {
        errorDisplay.textContent = err.message || String(err);
        errorDisplay.classList.remove('hidden');
        preview.innerHTML = '';
        placeholder.classList.add('hidden');
        currentSvg = null;
        setExportEnabled(false);
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
    renderTimeout = setTimeout(renderDiagram, 400);
}

// ─── Export Functions ────────────────────────────────────────────────────────

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

async function exportRaster(format) {
    const svg = getSvgWithBackground() || currentSvg;
    if (!svg) return;

    const scale = parseInt(scaleInput.value) || 2;

    // Create image from SVG
    const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.src = url;

    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });

    // Draw to canvas at scale
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;

    const ctx = canvas.getContext('2d');

    // Fill background for JPEG (no transparency)
    if (format === 'jpeg') {
        const bg = bgSelect.value;
        ctx.fillStyle = (bg === 'transparent') ? 'white' : bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);

    URL.revokeObjectURL(url);

    // Export
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    const quality = format === 'jpeg' ? 0.92 : undefined;

    canvas.toBlob((blob) => {
        if (blob) {
            downloadBlob(blob, `diagram.${format}`);
        }
    }, mimeType, quality);
}

async function copyToClipboard() {
    const svg = getSvgWithBackground();
    if (!svg) return;

    try {
        await navigator.clipboard.writeText(svg);
        const originalText = btnClipboard.textContent;
        btnClipboard.textContent = '✅ Copied!';
        setTimeout(() => { btnClipboard.textContent = originalText; }, 2000);
    } catch (err) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = svg;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        btnClipboard.textContent = '✅ Copied!';
        setTimeout(() => { btnClipboard.textContent = '📋 Copy SVG'; }, 2000);
    }
}

// ─── Example Diagram ────────────────────────────────────────────────────────

const EXAMPLE = `flowchart TD
    subgraph Intake["1. Project Intake"]
        FORM["ML Ops Intake Form"]
        SCOPE["Define Scope"]
        TEAMS["Assign Teams"]
    end

    subgraph DataEng["2. Data Engineering"]
        RAW["Raw Sources"] --> STG["Staging (STG_*)"]
        STG --> INT["Intermediate (INT_*)"]
        INT --> FEAT["Feature Table (RPT_*)"]
    end

    subgraph Model["3. Model Development"]
        TRAIN["Train Model"]
        EVAL["Evaluate"]
        REGISTER["Register in SRMR"]
    end

    subgraph Prod["4. Production"]
        RETRAIN["Nightly Retraining"]
        COMPARE["Compare vs Baseline"]
        SERVE["Serve Predictions"]
    end

    FORM --> SCOPE --> TEAMS
    TEAMS --> RAW
    FEAT --> TRAIN --> EVAL --> REGISTER
    REGISTER --> RETRAIN --> COMPARE --> SERVE`;

// ─── Event Listeners ────────────────────────────────────────────────────────

input.addEventListener('input', debounceRender);

themeSelect.addEventListener('change', () => {
    initMermaid(themeSelect.value);
    renderDiagram();
});

bgSelect.addEventListener('change', () => {
    const container = document.getElementById('preview-container');
    const bg = bgSelect.value;
    container.style.backgroundColor = bg === 'transparent' ? 'white' : bg;
});

btnExample.addEventListener('click', () => {
    input.value = EXAMPLE;
    renderDiagram();
});

btnClear.addEventListener('click', () => {
    input.value = '';
    renderDiagram();
    input.focus();
});

btnSvg.addEventListener('click', exportSvg);
btnPng.addEventListener('click', () => exportRaster('png'));
btnJpeg.addEventListener('click', () => exportRaster('jpeg'));
btnClipboard.addEventListener('click', copyToClipboard);

// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + Enter to render immediately
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(renderTimeout);
        renderDiagram();
    }
    // Cmd/Ctrl + S to export SVG
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (currentSvg) exportSvg();
    }
});

// ─── Init ───────────────────────────────────────────────────────────────────

// Auto-render if there's content (e.g., browser restored form state)
if (input.value.trim()) {
    renderDiagram();
}
