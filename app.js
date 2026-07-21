/**
 * Mermaid to Image Converter
 * Client-side Mermaid diagram rendering and export.
 * Uses global `mermaid` object from CDN script tag.
 */

(function () {
    'use strict';

    // ─── Elements ───────────────────────────────────────────────────────────

    var input = document.getElementById('mermaid-input');
    var preview = document.getElementById('mermaid-preview');
    var placeholder = document.getElementById('placeholder-text');
    var errorDisplay = document.getElementById('error-display');
    var themeSelect = document.getElementById('theme-select');
    var bgSelect = document.getElementById('bg-select');
    var scaleInput = document.getElementById('scale-input');

    var btnExample = document.getElementById('btn-example');
    var btnClear = document.getElementById('btn-clear');
    var btnSvg = document.getElementById('btn-svg');
    var btnPng = document.getElementById('btn-png');
    var btnJpeg = document.getElementById('btn-jpeg');
    var btnClipboard = document.getElementById('btn-clipboard');
    var btnZoomIn = document.getElementById('btn-zoom-in');
    var btnZoomOut = document.getElementById('btn-zoom-out');
    var btnZoomReset = document.getElementById('btn-zoom-reset');

    // ─── State ──────────────────────────────────────────────────────────────

    var currentSvg = null;
    var renderTimeout = null;
    var renderCounter = 0;
    var zoomLevel = 1;

    var ZOOM_STEP = 0.25;
    var ZOOM_MIN = 0.25;
    var ZOOM_MAX = 4;

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
        var code = input.value.trim();

        if (!code) {
            preview.innerHTML = '';
            placeholder.classList.remove('hidden');
            errorDisplay.classList.add('hidden');
            currentSvg = null;
            setExportEnabled(false);
            return;
        }

        try {
            renderCounter++;
            var id = 'mermaid-diagram-' + renderCounter;
            var result = await mermaid.render(id, code);

            preview.innerHTML = result.svg;
            placeholder.classList.add('hidden');
            errorDisplay.classList.add('hidden');
            currentSvg = result.svg;
            setExportEnabled(true);
            zoomReset();
        } catch (err) {
            var msg = err.message || err.str || String(err);
            errorDisplay.textContent = msg;
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
        renderTimeout = setTimeout(renderDiagram, 500);
    }

    // ─── Zoom ───────────────────────────────────────────────────────────────

    function applyZoom() {
        preview.style.transform = 'scale(' + zoomLevel + ')';
    }

    function zoomIn() {
        zoomLevel = Math.min(ZOOM_MAX, zoomLevel + ZOOM_STEP);
        applyZoom();
    }

    function zoomOut() {
        zoomLevel = Math.max(ZOOM_MIN, zoomLevel - ZOOM_STEP);
        applyZoom();
    }

    function zoomReset() {
        zoomLevel = 1;
        applyZoom();
    }

    // ─── Export Functions ────────────────────────────────────────────────────

    function downloadDataUri(dataUri, filename) {
        var a = document.createElement('a');
        a.href = dataUri;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function getSvgWithBackground() {
        if (!currentSvg) return null;

        var bg = bgSelect.value;
        if (bg === 'transparent') return currentSvg;

        var parser = new DOMParser();
        var doc = parser.parseFromString(currentSvg, 'image/svg+xml');
        var svgEl = doc.querySelector('svg');

        if (svgEl) {
            var rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('width', '100%');
            rect.setAttribute('height', '100%');
            rect.setAttribute('fill', bg);
            svgEl.insertBefore(rect, svgEl.firstChild);
        }

        return new XMLSerializer().serializeToString(doc);
    }

    function exportSvg() {
        var svg = getSvgWithBackground();
        if (!svg) return;
        var dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        downloadDataUri(dataUri, 'diagram.svg');
    }

    function exportRaster(format) {
        var svg = getSvgWithBackground() || currentSvg;
        if (!svg) return;

        var scale = parseInt(scaleInput.value) || 2;

        // Use data URI instead of blob URL (works with file://)
        var svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

        var img = new Image();

        img.onload = function () {
            var canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth * scale;
            canvas.height = img.naturalHeight * scale;

            var ctx = canvas.getContext('2d');

            if (format === 'jpeg') {
                var bg = bgSelect.value;
                ctx.fillStyle = (bg === 'transparent') ? 'white' : bg;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0);

            var mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
            var quality = format === 'jpeg' ? 0.92 : undefined;
            var dataUrl = canvas.toDataURL(mimeType, quality);
            downloadDataUri(dataUrl, 'diagram.' + format);
        };

        img.onerror = function () {
            console.error('Failed to load SVG for raster export');
            alert('Export failed. Try SVG export instead.');
        };

        img.src = svgDataUri;
    }

    function copyToClipboard() {
        var svg = getSvgWithBackground();
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
        var textarea = document.createElement('textarea');
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

    btnZoomIn.addEventListener('click', zoomIn);
    btnZoomOut.addEventListener('click', zoomOut);
    btnZoomReset.addEventListener('click', zoomReset);

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
