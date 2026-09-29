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
    var aiActiveProvider = document.getElementById('ai-active-provider');
    var aiActiveModel = document.getElementById('ai-active-model');
    var btnQuickSettings = document.getElementById('btn-quick-settings');

    var aiLoading = document.getElementById('ai-loading');
    var aiResultsPanel = document.getElementById('ai-results-panel');
    var aiDiagramsList = document.getElementById('ai-diagrams-list');
    var aiStatusIndicator = document.getElementById('ai-status-indicator');
    var aiCategorySelect = document.getElementById('ai-category-select');
    var aiRequirementSelect = document.getElementById('ai-requirement-select');
    var btnDownloadReport = document.getElementById('btn-download-report');
    var aiSummaryBox = document.getElementById('ai-summary-box');
    var aiSummaryText = document.getElementById('ai-summary-text');
    var aiReasoningText = document.getElementById('ai-reasoning-text');

    // ─── State ──────────────────────────────────────────────────────────────

    var currentSvg = null;
    var renderTimeout = null;
    var renderCounter = 0;
    var zoomLevel = 1;
    var lastAiResponse = null;
    var activeConfig = null; // the currently-active provider config (from the store)

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

        // Parse SVG and ensure explicit pixel width/height so the Image
        // element renders at the correct intrinsic size (not 300x150 default).
        var parser = new DOMParser();
        var doc = parser.parseFromString(svg, 'image/svg+xml');
        var svgEl = doc.querySelector('svg');

        if (svgEl) {
            var w = svgEl.getAttribute('width');
            var h = svgEl.getAttribute('height');
            var viewBox = svgEl.getAttribute('viewBox');

            // If width/height are missing or relative (e.g. "100%"), derive from viewBox
            var needsDimensions = !w || !h || w.includes('%') || h.includes('%');

            if (needsDimensions && viewBox) {
                var parts = viewBox.split(/[\s,]+/);
                var vbWidth = parseFloat(parts[2]);
                var vbHeight = parseFloat(parts[3]);
                if (vbWidth && vbHeight) {
                    svgEl.setAttribute('width', vbWidth + 'px');
                    svgEl.setAttribute('height', vbHeight + 'px');
                }
            } else if (needsDimensions) {
                // Fallback: measure from the rendered DOM element
                var rendered = preview.querySelector('svg');
                if (rendered) {
                    var bbox = rendered.getBoundingClientRect();
                    svgEl.setAttribute('width', bbox.width + 'px');
                    svgEl.setAttribute('height', bbox.height + 'px');
                }
            }

            svg = new XMLSerializer().serializeToString(doc);
        }

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

        async function checkLLMAvailability() {
            if (!aiStatusIndicator) return;

            // Refresh the active config so the generator always reflects the
            // latest Settings selection (no per-request provider/model here).
            await refreshActiveConfig();

            if (!activeConfig) {
                aiStatusIndicator.className = 'ai-status-indicator error';
                aiStatusIndicator.querySelector('.status-text').textContent = 'LLM Status: No provider configured. Open Settings to configure one.';
                return;
            }

            var provider = activeConfig.provider_type;
            var model = activeConfig.active_model;

            aiStatusIndicator.className = 'ai-status-indicator info';
            aiStatusIndicator.querySelector('.status-text').textContent = 'LLM Status: Checking availability of ' + provider + ' (' + model + ')...';

            try {
                // Let the server resolve provider/model/config from the active
                // stored config — the browser never handles endpoints or keys.
                var response = await fetch('/api/llm/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });

                if (!response.ok) {
                    throw new Error('Status endpoint returned status ' + response.status);
                }

                var data = await response.json();
                aiStatusIndicator.className = data.available ? 'ai-status-indicator success' : 'ai-status-indicator error';
                aiStatusIndicator.querySelector('.status-text').textContent = 'LLM Status: ' + data.reason;
            } catch (err) {
                aiStatusIndicator.className = 'ai-status-indicator error';
                aiStatusIndicator.querySelector('.status-text').textContent = 'LLM Status: Offline (' + err.message + ')';
            }
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

        // "Configure" shortcut opens the Settings modal.
        if (btnQuickSettings) {
            btnQuickSettings.addEventListener('click', openSettings);
        }

        // Initial check on load
        checkLLMAvailability();

        // Re-check availability whenever settings change the active engine.
        document.addEventListener('llm-active-changed', checkLLMAvailability);

        // Generate Action
        btnGenerateAi.addEventListener('click', async function () {
            var prompt = aiPromptInput.value.trim();
            if (!prompt) {
                alert('Please describe what you want to diagram first!');
                return;
            }

            // UI Loading state
            btnGenerateAi.disabled = true;
            aiLoading.classList.remove('hidden');
            aiResultsPanel.classList.add('hidden');
            aiDiagramsList.innerHTML = '';

            try {
                // Provider/model/endpoint/key are resolved server-side from the
                // active stored config — the browser only sends the prompt.
                var response = await fetch('/api/llm/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: prompt })
                });

                if (!response.ok) {
                    var errData = await response.json();
                    throw new Error(errData.detail || errData.error || 'Failed to generate');
                }

                var data = await response.json();
                lastAiResponse = data;
                renderAiResults(data);
            } catch (err) {
                console.error('AI Generation error:', err);
                alert('Error generating diagrams: ' + err.message);
            } finally {
                btnGenerateAi.disabled = false;
                aiLoading.classList.add('hidden');
            }
        });

        if (btnDownloadReport) {
            btnDownloadReport.addEventListener('click', function () {
                if (!lastAiResponse || !lastAiResponse.reportMarkdown) {
                    alert('No generated report available to download.');
                    return;
                }
                var markdownText = lastAiResponse.reportMarkdown;
                var dataUri = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(markdownText);
                downloadDataUri(dataUri, 'architecture-diagram-report.md');
            });
        }
    }

    function renderAiResults(data) {
        var diagrams = Array.isArray(data) ? data : (data ? data.diagrams : []);

        if (!diagrams || diagrams.length === 0) {
            aiDiagramsList.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted); text-align:center;">No diagrams generated. Try refining your prompt.</p>';
            if (aiSummaryBox) aiSummaryBox.classList.add('hidden');
            aiResultsPanel.classList.remove('hidden');
            return;
        }

        // Render Summary & Reasoning if available
        if (data && data.summary && aiSummaryBox && aiSummaryText && aiReasoningText) {
            aiSummaryText.textContent = data.summary;
            aiReasoningText.textContent = data.reasoning || 'Diagram types selected to visually detail structural and procedural flows.';
            aiSummaryBox.classList.remove('hidden');
        } else if (aiSummaryBox) {
            aiSummaryBox.classList.add('hidden');
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
                
                renderDiagram();
            });

            aiDiagramsList.appendChild(card);
        });

        aiResultsPanel.classList.remove('hidden');
    }

    // ─── Active Config (shared between AI Generator + Settings) ─────────────

    async function refreshActiveConfig() {
        try {
            var res = await fetch('/api/llm/configs');
            if (!res.ok) throw new Error('status ' + res.status);
            var configs = await res.json();
            activeConfig = configs.find(function (c) { return c.is_active; }) || configs[0] || null;
            updateActiveBar();
            return configs;
        } catch (err) {
            console.error('Failed to load LLM configs:', err);
            activeConfig = null;
            updateActiveBar();
            return [];
        }
    }

    function updateActiveBar() {
        if (!aiActiveProvider || !aiActiveModel) return;
        if (activeConfig) {
            aiActiveProvider.textContent = activeConfig.name + ' (' + activeConfig.provider_type + ')';
            aiActiveModel.textContent = activeConfig.active_model || '—';
        } else {
            aiActiveProvider.textContent = 'Not configured';
            aiActiveModel.textContent = '—';
        }
    }

    // ─── Settings Modal ─────────────────────────────────────────────────────

    var settingsOverlay = document.getElementById('settings-overlay');
    var btnOpenSettings = document.getElementById('btn-open-settings');
    var btnCloseSettings = document.getElementById('btn-close-settings');
    var settingsActiveProvider = document.getElementById('settings-active-provider');
    var settingsActiveModel = document.getElementById('settings-active-model');
    var settingsActiveModelHint = document.getElementById('settings-active-model-hint');
    var btnSaveActive = document.getElementById('btn-save-active');
    var settingsProviderList = document.getElementById('settings-provider-list');
    var btnReseed = document.getElementById('btn-reseed');

    var settingsConfigs = [];        // last-loaded configs
    var settingsEdits = {};          // per-provider unsaved edits { id: {base_url, api_key} }

    function openSettings() {
        if (!settingsOverlay) return;
        settingsOverlay.classList.remove('hidden');
        loadSettings();
    }

    function closeSettings() {
        if (settingsOverlay) settingsOverlay.classList.add('hidden');
    }

    async function loadSettings() {
        var configs = await refreshActiveConfig();
        settingsConfigs = configs;
        settingsEdits = {};
        renderActiveSelectors();
        renderProviderCards();
    }

    function modelsFor(cfg) {
        if (!cfg) return [];
        if (cfg.available_models && cfg.available_models.length) return cfg.available_models.slice();
        return cfg.active_model ? [cfg.active_model] : [];
    }

    function renderActiveSelectors() {
        if (!settingsActiveProvider) return;
        var current = activeConfig ? activeConfig.id : (settingsConfigs[0] && settingsConfigs[0].id);

        settingsActiveProvider.innerHTML = '';
        settingsConfigs.forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name + ' (' + c.provider_type + ')' + (c.is_active ? ' ★' : '');
            settingsActiveProvider.appendChild(opt);
        });
        if (current) settingsActiveProvider.value = current;

        renderActiveModelOptions();

        settingsActiveProvider.onchange = function () {
            renderActiveModelOptions();
        };
    }

    function renderActiveModelOptions() {
        var cfg = settingsConfigs.find(function (c) { return c.id === settingsActiveProvider.value; });
        var models = modelsFor(cfg);
        settingsActiveModel.innerHTML = '';
        models.forEach(function (m) {
            var opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            settingsActiveModel.appendChild(opt);
        });
        if (cfg && cfg.active_model) settingsActiveModel.value = cfg.active_model;

        if (settingsActiveModelHint) {
            var hasDiscovered = cfg && cfg.available_models && cfg.available_models.length;
            settingsActiveModelHint.textContent = hasDiscovered
                ? '✓ ' + cfg.available_models.length + ' model(s) discovered'
                : 'Run Test Connection on this provider to discover models';
        }
    }

    if (btnSaveActive) {
        btnSaveActive.addEventListener('click', async function () {
            btnSaveActive.disabled = true;
            try {
                await fetch('/api/llm/active', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        config_id: settingsActiveProvider.value,
                        active_model: settingsActiveModel.value
                    })
                });
                await loadSettings();
                document.dispatchEvent(new CustomEvent('llm-active-changed'));
            } catch (err) {
                alert('Failed to save active engine: ' + err.message);
            } finally {
                btnSaveActive.disabled = false;
            }
        });
    }

    function renderProviderCards() {
        if (!settingsProviderList) return;
        settingsProviderList.innerHTML = '';

        settingsConfigs.forEach(function (cfg) {
            var card = document.createElement('div');
            card.className = 'provider-card' + (cfg.is_active ? ' is-active' : '');

            // Header
            var head = document.createElement('div');
            head.className = 'provider-card-head';
            head.innerHTML =
                '<span class="provider-name">' + escapeHtml(cfg.name) + '</span>' +
                '<span class="provider-type">(' + escapeHtml(cfg.provider_type) + ')</span>' +
                (cfg.is_active ? '<span class="provider-badge active">Active</span>' : '') +
                '<span class="provider-status ' + cfg.status + '">' + statusLabel(cfg.status) + '</span>';
            card.appendChild(head);

            // Editable fields
            var needsKey = cfg.provider_type !== 'ollama';
            var fields = document.createElement('div');
            fields.className = 'provider-fields';

            var urlGroup = document.createElement('div');
            urlGroup.className = 'control-group';
            var urlLabel = cfg.provider_type === 'ollama' ? 'Host / Base URL' : 'Base URL';
            urlGroup.innerHTML = '<label>' + urlLabel + '</label>';
            var urlInput = document.createElement('input');
            urlInput.type = 'text';
            urlInput.value = cfg.base_url || '';
            urlInput.placeholder = 'http://localhost:11434';
            urlInput.addEventListener('input', function () {
                settingsEdits[cfg.id] = settingsEdits[cfg.id] || {};
                settingsEdits[cfg.id].base_url = urlInput.value;
            });
            urlGroup.appendChild(urlInput);
            fields.appendChild(urlGroup);

            if (needsKey) {
                var keyGroup = document.createElement('div');
                keyGroup.className = 'control-group';
                keyGroup.innerHTML = '<label>API Key' + (cfg.has_api_key ? ' (stored)' : '') + '</label>';
                var keyInput = document.createElement('input');
                keyInput.type = 'password';
                keyInput.value = '';
                keyInput.placeholder = cfg.has_api_key ? '•••••••• (leave blank to keep)' : 'Enter API key';
                keyInput.addEventListener('input', function () {
                    settingsEdits[cfg.id] = settingsEdits[cfg.id] || {};
                    settingsEdits[cfg.id].api_key = keyInput.value;
                });
                keyGroup.appendChild(keyInput);
                fields.appendChild(keyGroup);
            }
            card.appendChild(fields);

            // Actions
            var actions = document.createElement('div');
            actions.className = 'provider-card-actions';

            var testBtn = document.createElement('button');
            testBtn.className = 'provider-small-btn';
            testBtn.textContent = '🔌 Test Connection';
            actions.appendChild(testBtn);

            var saveBtn = document.createElement('button');
            saveBtn.className = 'provider-small-btn';
            saveBtn.textContent = '💾 Save';
            actions.appendChild(saveBtn);

            card.appendChild(actions);

            var resultEl = document.createElement('div');
            resultEl.className = 'provider-test-result hidden';
            card.appendChild(resultEl);

            // Save provider (base_url + api_key)
            saveBtn.addEventListener('click', async function () {
                var edit = settingsEdits[cfg.id] || {};
                saveBtn.disabled = true;
                try {
                    await fetch('/api/llm/configs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: cfg.id,
                            base_url: edit.base_url !== undefined ? edit.base_url : cfg.base_url,
                            api_key: edit.api_key !== undefined ? edit.api_key : ''
                        })
                    });
                    await loadSettings();
                } catch (err) {
                    alert('Failed to save provider: ' + err.message);
                } finally {
                    saveBtn.disabled = false;
                }
            });

            // Test connection + discover models
            testBtn.addEventListener('click', async function () {
                var edit = settingsEdits[cfg.id] || {};
                testBtn.disabled = true;
                resultEl.className = 'provider-test-result';
                resultEl.classList.remove('hidden');
                resultEl.textContent = 'Testing…';
                try {
                    var res = await fetch('/api/llm/test', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            config_id: cfg.id,
                            provider_type: cfg.provider_type,
                            base_url: edit.base_url !== undefined ? edit.base_url : cfg.base_url,
                            api_key: edit.api_key !== undefined ? edit.api_key : ''
                        })
                    });
                    var data = await res.json();
                    resultEl.className = 'provider-test-result ' + (data.status === 'online' ? 'online' : 'offline');
                    var modelNote = data.models && data.models.length ? ' — ' + data.models.length + ' model(s) found' : '';
                    resultEl.textContent = (data.status === 'online' ? '✓ ' : '✗ ') + data.message + modelNote +
                        (data.latency_ms != null ? ' (' + data.latency_ms + 'ms)' : '');
                    // Reload so discovered models flow into the dropdowns, but
                    // keep this card's unsaved edits.
                    await loadSettings();
                } catch (err) {
                    resultEl.className = 'provider-test-result offline';
                    resultEl.textContent = '✗ ' + err.message;
                } finally {
                    testBtn.disabled = false;
                }
            });

            settingsProviderList.appendChild(card);
        });
    }

    function statusLabel(status) {
        if (status === 'online') return '● Online';
        if (status === 'offline') return '● Offline';
        return '○ Unconfigured';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    if (btnOpenSettings) btnOpenSettings.addEventListener('click', openSettings);
    if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);
    if (btnReseed) {
        btnReseed.addEventListener('click', async function () {
            if (!confirm('Reset all provider configs to defaults? This clears saved endpoints and keys.')) return;
            try {
                await fetch('/api/llm/reseed', { method: 'POST' });
                await loadSettings();
                document.dispatchEvent(new CustomEvent('llm-active-changed'));
            } catch (err) {
                alert('Failed to reseed: ' + err.message);
            }
        });
    }
    if (settingsOverlay) {
        settingsOverlay.addEventListener('click', function (e) {
            if (e.target === settingsOverlay) closeSettings();
        });
    }
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && settingsOverlay && !settingsOverlay.classList.contains('hidden')) {
            closeSettings();
        }
    });

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
