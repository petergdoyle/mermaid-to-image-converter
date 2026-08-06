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
    var groupSelect = document.getElementById('sample-group-select');
    var diagramSelect = document.getElementById('sample-diagram-select');
    var descriptionPanel = document.getElementById('sample-description-panel');

    var btnClear = document.getElementById('btn-clear');
    var btnSvg = document.getElementById('btn-svg');
    var btnPng = document.getElementById('btn-png');
    var btnJpeg = document.getElementById('btn-jpeg');
    var btnClipboard = document.getElementById('btn-clipboard');
    var btnZoomIn = document.getElementById('btn-zoom-in');
    var btnZoomOut = document.getElementById('btn-zoom-out');
    var btnZoomReset = document.getElementById('btn-zoom-reset');

    // AI Elements
    var tabTemplates = document.getElementById('tab-templates');
    var tabAi = document.getElementById('tab-ai');
    var panelTemplates = document.getElementById('panel-templates');
    var panelAi = document.getElementById('panel-ai');

    var aiPromptInput = document.getElementById('ai-prompt-input');
    var btnGenerateAi = document.getElementById('btn-generate-ai');
    var aiProviderSelect = document.getElementById('ai-provider-select');
    var aiModelInput = document.getElementById('ai-model-input');
    var aiEndpointInput = document.getElementById('ai-endpoint-input');
    var aiKeyInput = document.getElementById('ai-key-input');
    var aiEndpointGroup = document.getElementById('ai-endpoint-group');
    var aiKeyGroup = document.getElementById('ai-key-group');

    var aiLoading = document.getElementById('ai-loading');
    var aiResultsPanel = document.getElementById('ai-results-panel');
    var aiDiagramsList = document.getElementById('ai-diagrams-list');
    var aiStatusIndicator = document.getElementById('ai-status-indicator');
    var aiCategorySelect = document.getElementById('ai-category-select');
    var aiRequirementSelect = document.getElementById('ai-requirement-select');

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

    initMermaid('neutral');

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
        zoomReset();
        var svg = getSvgWithBackground();
        if (!svg) return;
        var dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        downloadDataUri(dataUri, 'diagram.svg');
    }

    function exportRaster(format) {
        zoomReset();
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
        zoomReset();
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

    btnClear.addEventListener('click', function () {
        input.value = '';
        renderDiagram();
        input.focus();
    });

    btnSvg.addEventListener('click', exportSvg);
    btnPng.addEventListener('click', function () { exportRaster('png'); });
    btnJpeg.addEventListener('click', function () { exportRaster('jpeg'); });
    btnClipboard.addEventListener('click', copyToClipboard);

    btnZoomIn.addEventListener('click', function () {
        zoomLevel = Math.min(ZOOM_MAX, zoomLevel + ZOOM_STEP);
        applyZoom();
    });
    btnZoomOut.addEventListener('click', function () {
        zoomLevel = Math.max(ZOOM_MIN, zoomLevel - ZOOM_STEP);
        applyZoom();
    });
    btnZoomReset.addEventListener('click', function () {
        zoomLevel = 1;
        applyZoom();
    });

    // ─── Samples / Templates Init ───────────────────────────────────────────

    function initSamples() {
        if (!window.MERMAID_SAMPLES) return;

        // Populate groups
        window.MERMAID_SAMPLES.groups.forEach(function (group) {
            var opt = document.createElement('option');
            opt.value = group.id;
            opt.textContent = group.name;
            groupSelect.appendChild(opt);
        });

        // On Group change
        groupSelect.addEventListener('change', function () {
            var groupId = groupSelect.value;
            diagramSelect.innerHTML = '<option value="">Choose template...</option>';
            descriptionPanel.classList.add('hidden');

            if (!groupId) {
                diagramSelect.disabled = true;
                return;
            }

            var groupSamples = window.MERMAID_SAMPLES.samples.filter(function (s) {
                return s.group_id === groupId;
            });

            groupSamples.forEach(function (sample) {
                var opt = document.createElement('option');
                opt.value = sample.id;
                opt.textContent = sample.name;
                diagramSelect.appendChild(opt);
            });

            diagramSelect.disabled = false;
        });

        // On Diagram selection
        diagramSelect.addEventListener('change', function () {
            var diagramId = diagramSelect.value;
            if (!diagramId) {
                descriptionPanel.classList.add('hidden');
                return;
            }

            var sample = window.MERMAID_SAMPLES.samples.find(function (s) {
                return s.id === diagramId;
            });

            if (sample) {
                input.value = sample.code;
                descriptionPanel.textContent = sample.description;
                descriptionPanel.classList.remove('hidden');
                renderDiagram();
            }
        });
    }

    // ─── AI Generator ───────────────────────────────────────────────────────

    function initAiGenerator() {
        if (!tabTemplates || !tabAi) return;

        // Populate Categories & Examples
        if (window.AI_REQUIREMENTS_SAMPLES) {
            window.AI_REQUIREMENTS_SAMPLES.categories.forEach(function (cat) {
                var opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.name;
                aiCategorySelect.appendChild(opt);
            });

            aiCategorySelect.addEventListener('change', function () {
                var catId = aiCategorySelect.value;
                aiRequirementSelect.innerHTML = '<option value="">Choose example...</option>';
                
                if (!catId) {
                    aiRequirementSelect.disabled = true;
                    return;
                }

                var filtered = window.AI_REQUIREMENTS_SAMPLES.requirements.filter(function (r) {
                    return r.category_id === catId;
                });

                filtered.forEach(function (req) {
                    var opt = document.createElement('option');
                    opt.value = req.id;
                    opt.textContent = req.name;
                    aiRequirementSelect.appendChild(opt);
                });

                aiRequirementSelect.disabled = false;
            });

            aiRequirementSelect.addEventListener('change', function () {
                var reqId = aiRequirementSelect.value;
                if (!reqId) return;

                var selectedReq = window.AI_REQUIREMENTS_SAMPLES.requirements.find(function (r) {
                    return r.id === reqId;
                });

                if (selectedReq) {
                    aiPromptInput.value = selectedReq.prompt;
                }
            });
        }

        var statusTimeout = null;

        async function checkLLMAvailability() {
            if (!aiStatusIndicator) return;

            var provider = aiProviderSelect.value;
            var model = aiModelInput.value.trim();
            var endpoint = aiEndpointInput.value.trim();
            var apiKey = aiKeyInput.value.trim();

            var config = {};
            if (provider === 'ollama' && endpoint) {
                config.endpoint = endpoint;
            }
            if (provider === 'google' && apiKey) {
                config.apiKey = apiKey;
            }

            aiStatusIndicator.className = 'ai-status-indicator info';
            aiStatusIndicator.querySelector('.status-text').textContent = 'LLM Status: Checking availability of ' + provider + ' (' + model + ')...';

            try {
                var response = await fetch('/api/llm/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: provider,
                        model: model,
                        config: config
                    })
                });

                if (!response.ok) {
                    throw new Error('Status endpoint returned status ' + response.status);
                }

                var data = await response.json();
                if (data.available) {
                    aiStatusIndicator.className = 'ai-status-indicator success';
                    aiStatusIndicator.querySelector('.status-text').textContent = 'LLM Status: ' + data.reason;
                } else {
                    aiStatusIndicator.className = 'ai-status-indicator error';
                    aiStatusIndicator.querySelector('.status-text').textContent = 'LLM Status: ' + data.reason;
                }
            } catch (err) {
                aiStatusIndicator.className = 'ai-status-indicator error';
                aiStatusIndicator.querySelector('.status-text').textContent = 'LLM Status: Offline (' + err.message + ')';
            }
        }

        function debounceStatusCheck() {
            clearTimeout(statusTimeout);
            statusTimeout = setTimeout(checkLLMAvailability, 600);
        }

        // Tab Switchers
        tabTemplates.addEventListener('click', function () {
            tabTemplates.classList.add('active');
            tabAi.classList.remove('active');
            panelTemplates.classList.remove('hidden');
            panelAi.classList.add('hidden');
        });

        tabAi.addEventListener('click', function () {
            tabAi.classList.add('active');
            tabTemplates.classList.remove('active');
            panelAi.classList.remove('hidden');
            panelTemplates.classList.add('hidden');
            checkLLMAvailability();
        });

        // Provider Options Toggle
        aiProviderSelect.addEventListener('change', function () {
            var provider = aiProviderSelect.value;
            if (provider === 'ollama') {
                aiEndpointGroup.classList.remove('hidden');
                aiKeyGroup.classList.add('hidden');
                aiModelInput.value = 'gemma4:12b';
            } else if (provider === 'google') {
                aiEndpointGroup.classList.add('hidden');
                aiKeyGroup.classList.remove('hidden');
                aiModelInput.value = 'gemini-1.5-flash';
            }
            checkLLMAvailability();
        });

        // Listen for config changes
        aiModelInput.addEventListener('input', debounceStatusCheck);
        aiEndpointInput.addEventListener('input', debounceStatusCheck);
        aiKeyInput.addEventListener('input', debounceStatusCheck);

        // Initial check on load
        checkLLMAvailability();

        // Generate Action
        btnGenerateAi.addEventListener('click', async function () {
            var prompt = aiPromptInput.value.trim();
            if (!prompt) {
                alert('Please describe what you want to diagram first!');
                return;
            }

            var provider = aiProviderSelect.value;
            var model = aiModelInput.value.trim();
            var endpoint = aiEndpointInput.value.trim();
            var apiKey = aiKeyInput.value.trim();

            var config = {};
            if (provider === 'ollama' && endpoint) {
                config.endpoint = endpoint;
            }
            if (provider === 'google' && apiKey) {
                config.apiKey = apiKey;
            }

            // UI Loading state
            btnGenerateAi.disabled = true;
            aiLoading.classList.remove('hidden');
            aiResultsPanel.classList.add('hidden');
            aiDiagramsList.innerHTML = '';

            try {
                var response = await fetch('/api/llm/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: prompt,
                        provider: provider,
                        model: model,
                        config: config
                    })
                });

                if (!response.ok) {
                    var errData = await response.json();
                    throw new Error(errData.detail || errData.error || 'Failed to generate');
                }

                var data = await response.json();
                renderAiResults(data.diagrams);
            } catch (err) {
                console.error('AI Generation error:', err);
                alert('Error generating diagrams: ' + err.message);
            } finally {
                btnGenerateAi.disabled = false;
                aiLoading.classList.add('hidden');
            }
        });
    }

    function renderAiResults(diagrams) {
        if (!diagrams || diagrams.length === 0) {
            aiDiagramsList.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted); text-align:center;">No diagrams generated. Try refining your prompt.</p>';
            aiResultsPanel.classList.remove('hidden');
            return;
        }

        aiDiagramsList.innerHTML = '';
        diagrams.forEach(function (diagram) {
            var card = document.createElement('button');
            card.className = 'ai-diagram-card';
            card.type = 'button';

            var titleEl = document.createElement('div');
            titleEl.className = 'ai-diagram-card-title';
            titleEl.textContent = diagram.name + ' ';
            
            var badge = document.createElement('span');
            badge.className = 'ai-diagram-card-type';
            badge.textContent = diagram.type;
            titleEl.appendChild(badge);

            var descEl = document.createElement('div');
            descEl.className = 'ai-diagram-card-desc';
            descEl.textContent = diagram.description;

            card.appendChild(titleEl);
            card.appendChild(descEl);

            card.addEventListener('click', function () {
                input.value = diagram.code;
                descriptionPanel.textContent = diagram.description;
                descriptionPanel.classList.remove('hidden');
                
                // Switch back to templates panel visual cue or keep it there?
                // Just loading code and rendering is good
                renderDiagram();
            });

            aiDiagramsList.appendChild(card);
        });

        aiResultsPanel.classList.remove('hidden');
    }

    initAiGenerator();


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

    initSamples();

    if (input.value.trim()) {
        renderDiagram();
    }

})();
