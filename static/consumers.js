async function initConsumers(config, schema) {
    const consumers = config.consumers || [];
    const MSG_STORAGE_KEY = 'mqb_consumer_messages';
    const defaultMetricsMiddleware = () => [{ metrics: {} }];
    const CONSUMER_TYPE_OPTIONS = [
        'http',
        'grpc',
        'nats',
        'memory',
        'amqp',
        'kafka',
        'mqtt',
        'mongodb',
        'zeromq',
        'file',
        'sled',
    ];
    const RESPONSE_CAPABLE_CONSUMER_TYPES = new Set([
        'http',
        'nats',
        'memory',
        'amqp',
        'mongodb',
        'mqtt',
        'zeromq',
        'kafka',
    ]);

    const applyEndpointSchemaDefaults = (itemSchema) => {
        const fileConfigSchema = itemSchema.$defs?.FileConfig;
        if (fileConfigSchema?.properties?.format) {
            fileConfigSchema.properties.format.default = 'raw';
        }

        const mongoDbConfigSchema = itemSchema.$defs?.MongoDbConfig;
        if (mongoDbConfigSchema?.properties?.format) {
            mongoDbConfigSchema.properties.format.default = 'raw';
        }
    };

    if (window._mqb_consumer_poll_timer) {
        clearTimeout(window._mqb_consumer_poll_timer);
    }
    window._mqb_consumer_poll_timer = null;
    window._mqb_consumer_poll_nonce = (window._mqb_consumer_poll_nonce || 0) + 1;
    const pollNonce = window._mqb_consumer_poll_nonce;

    const consList = document.getElementById('cons-list');
    const logBody = document.getElementById('consumer-log-body');
    const consSubTabs = document.getElementById('cons-sub-tabs');
    let currentIdx = 0;

    const updateUrlHash = () => {
        const idx = typeof currentIdx !== 'undefined' ? currentIdx : 0;
        window.history.replaceState(null, null, `#consumers:${idx}`);
    };

    // Load existing messages from LocalStorage
    let consumerMessages = JSON.parse(localStorage.getItem(MSG_STORAGE_KEY) || '{}');
    const saveMessages = () => localStorage.setItem(MSG_STORAGE_KEY, JSON.stringify(consumerMessages));

    let consumerStatus = {};
    if (!(window._mqb_saved_consumer_names instanceof Set)) {
        window._mqb_saved_consumer_names = new Set(consumers.map((consumer) => consumer.name));
    }
    const isSavedConsumer = (name) => window._mqb_saved_consumer_names.has(name);

    const schedulePoll = (delayMs) => {
        if (window._mqb_consumer_poll_nonce !== pollNonce) return;
        if (window._mqb_consumer_poll_timer) clearTimeout(window._mqb_consumer_poll_timer);
        window._mqb_consumer_poll_timer = setTimeout(pollLoop, delayMs);
    };

    const fetchConsumerStatus = async (name) => {
        if (!isSavedConsumer(name)) {
            consumerStatus[name] = { running: false, status: { healthy: false }, unsaved: true };
            return;
        }
        try {
            const res = await fetch(`/consumer-status?consumer=${encodeURIComponent(name)}`);
            if (res.ok) {
                const data = await res.json();
                consumerStatus[name] = data;
            }
        } catch (e) { console.error("Error fetching status:", e); }
    };

    const refreshConsumerStatuses = async () => {
        const currentConsumers = config.consumers || [];
        await Promise.all(currentConsumers.map((consumer) => fetchConsumerStatus(consumer.name)));
        updateConsumerList();
        renderLiveLog();
    };

    const toggleConsumer = async (name) => {
        const isRunning = consumerStatus[name]?.running;
        const action = isRunning ? 'stop' : 'start';
        try {
            const toggleBtn = document.getElementById('cons-toggle');
            if (toggleBtn) {
                toggleBtn.loading = true; // Shoelace loading state
            }
            const res = await fetch(`/consumer-${action}?consumer=${encodeURIComponent(name)}`, { method: 'POST' });
            if (res.ok) {
                await fetchConsumerStatus(name); // Fetch status to update UI
            }
        } catch (e) { 
            console.error(`Error during ${action}:`, e);
            window.mqbAlert(`Failed to ${action} consumer`);
        } finally {
            const toggleBtn = document.getElementById('cons-toggle');
            if (toggleBtn) {
                toggleBtn.loading = false;
            }
        }
    };

    const extractUuidV7Timestamp = (idStr) => {
        try {
            // UUIDv7 hex: 018f3a3a-3a3a-... (First 48 bits / 12 hex chars are timestamp in ms)
            const hex = idStr.replace(/-/g, '');
            const ms = parseInt(hex.substring(0, 12), 16);
            return new Date(ms).toLocaleTimeString(); // Use toLocaleTimeString for brevity
        } catch (e) { return null; }
    };

    const getConsumerInputType = (consumer) => {
        const input = consumer?.endpoint || {};
        return Object.keys(input).filter((key) => key !== 'middlewares')[0] || 'N/A';
    };

    const createDefaultConsumerEndpoint = (endpointType) => ({
        middlewares: defaultMetricsMiddleware(),
        [endpointType]: {},
    });

    const nextConsumerName = (endpointType) => {
        const existingNames = new Set((config.consumers || []).map((consumer) => consumer.name));
        let index = 1;
        let candidate = `${endpointType}_${index}`;
        while (existingNames.has(candidate)) {
            index += 1;
            candidate = `${endpointType}_${index}`;
        }
        return candidate;
    };

    const addConsumer = async () => {
        const endpointType = await window.mqbChoose(
            "Choose the endpoint type for the new consumer.",
            "Add Consumer",
            {
                confirmLabel: 'Create',
                choices: CONSUMER_TYPE_OPTIONS.map((type) => ({
                    value: type,
                    label: type.toUpperCase(),
                })),
            },
        );
        if (!endpointType) return;
        config.consumers.push({
            name: nextConsumerName(endpointType),
            endpoint: createDefaultConsumerEndpoint(endpointType),
            comment: '',
            response: null,
        });
        window.initConsumers(config, schema);
        setActiveItem(config.consumers.length - 1);
        updateUI();
    };

    const consumerSupportsCustomResponse = (consumer) =>
        RESPONSE_CAPABLE_CONSUMER_TYPES.has(getConsumerInputType(consumer).toLowerCase());

    const normalizeConsumerResponse = (response) => {
        if (!response || typeof response !== 'object') return null;
        const headers = Object.fromEntries(
            Object.entries(response.headers || {})
                .map(([key, value]) => [String(key).trim(), String(value).trim()])
                .filter(([key, value]) => key && value),
        );
        const payload = typeof response.payload === 'string' ? response.payload : '';
        return Object.keys(headers).length > 0 || payload.trim()
            ? { headers, payload }
            : null;
    };

    const escapeHtml = (value) =>
        String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    const renderConsumerResponseEditor = (consumer, idx) => {
        const container = document.getElementById('cons-response-editor');
        if (!container) return;

        if (!consumerSupportsCustomResponse(consumer)) {
            container.style.display = 'none';
            container.innerHTML = '';
            config.consumers[idx].response = null;
            return;
        }

        const response = normalizeConsumerResponse(consumer.response) || { headers: {}, payload: '' };
        config.consumers[idx].response = response;

        const headerRows = Object.entries(response.headers).sort(([a], [b]) => a.localeCompare(b));
        container.style.display = 'block';
        container.innerHTML = `
            <div class="section-toolbar response-editor-header">
                <div class="section-label">Custom Response</div>
                <span class="form-description">Returned to request-response consumer endpoints after the message is logged.</span>
            </div>
            <div class="response-editor-grid">
                <div class="section-label">Headers</div>
                <div id="cons-response-headers">
                    ${headerRows.map(([key, value], headerIdx) => `
                        <div class="response-header-row" data-header-idx="${headerIdx}">
                            <input class="field-input cons-response-header-key" type="text" placeholder="Header name" value="${escapeHtml(key)}">
                            <input class="field-input cons-response-header-value" type="text" placeholder="Header value" value="${escapeHtml(value)}">
                            <wa-button variant="neutral" appearance="outlined" size="small" class="cons-response-header-delete">Delete</wa-button>
                        </div>
                    `).join('')}
                </div>
                <div class="response-editor-actions">
                    <wa-button variant="neutral" appearance="outlined" size="small" id="cons-response-add-header">Add Header</wa-button>
                </div>
                <div class="section-label">Payload</div>
                <textarea class="body-editor" id="cons-response-payload" spellcheck="false" placeholder="Response body">${escapeHtml(response.payload)}</textarea>
            </div>
        `;

        const syncResponseState = () => {
            const headers = {};
            container.querySelectorAll('.response-header-row').forEach((row) => {
                const key = row.querySelector('.cons-response-header-key')?.value?.trim() || '';
                const value = row.querySelector('.cons-response-header-value')?.value?.trim() || '';
                if (key && value) headers[key] = value;
            });
            const payload = container.querySelector('#cons-response-payload')?.value || '';
            config.consumers[idx].response = normalizeConsumerResponse({ headers, payload });
        };

        container.querySelector('#cons-response-add-header')?.addEventListener('click', () => {
            headerRows.push(['', '']);
            config.consumers[idx].response = normalizeConsumerResponse({ headers: Object.fromEntries(headerRows), payload: response.payload }) || { headers: {}, payload: response.payload };
            renderConsumerResponseEditor(config.consumers[idx], idx);
        });

        container.querySelectorAll('.cons-response-header-delete').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.target.closest('.response-header-row')?.remove();
                syncResponseState();
            });
        });

        container.querySelectorAll('.cons-response-header-key, .cons-response-header-value').forEach((input) => {
            input.addEventListener('input', syncResponseState);
        });
        container.querySelector('#cons-response-payload')?.addEventListener('input', syncResponseState);
    };

    const renderSidebar = () => {
        const list = document.getElementById('cons-list');
        if (!list) return;
        list.innerHTML = '<div class="sidebar-group-label">Saved</div>' + 
            consumers.map((c, i) => {
                const proto = getConsumerInputType(c).toUpperCase();
                const status = consumerStatus[c.name];
                const statusClass = status
                    ? (status.running ? (status.status?.healthy ? 'status-ok' : 'status-err') : 'status-off')
                    : 'status-off';
                return `
                <div class="sidebar-item cons-item" data-idx="${i}">
                    <span class="proto-badge proto-${proto.toLowerCase()}">${proto}</span>
                    <span class="item-name">${c.name}</span>
                    <span class="msg-count" style="margin-left:auto;">${consumerMessages[c.name]?.length || 0}</span>
                    <span class="item-status ${statusClass}"></span>
                </div>
            `}).join('');
        
        const hasCons = consumers.length > 0;
        document.getElementById('cons-empty-alert').style.display = hasCons ? 'none' : 'block';
        document.getElementById('cons-main-ui').style.display = hasCons ? 'contents' : 'none';
    };

    const updateConsumerList = () => {
        document.querySelectorAll('#cons-list .cons-item').forEach(btn => {
            const name = btn.querySelector('.item-name').textContent;
            const status = consumerStatus[name];
            const indicator = btn.querySelector('.item-status');
            const protoBadge = btn.querySelector('.proto-badge');

            // Update protocol badge
            const consumerConfig = consumers.find(c => c.name === name);
            if (consumerConfig && consumerConfig.input) {
                const proto = getConsumerInputType(consumerConfig).toUpperCase();
                protoBadge.textContent = proto;
                protoBadge.className = `proto-badge proto-${proto.toLowerCase()}`;
            }

            // Update status indicator
            if (indicator && status) {
                indicator.classList.remove('status-ok', 'status-err', 'status-off');
                if (status.running) {
                    indicator.classList.add(status.status?.healthy ? 'status-ok' : 'status-err');
                } else {
                    indicator.classList.add('status-off');
                }
            }
        });
    };

    const setActiveItem = (idx) => {
        currentIdx = idx;
        document.querySelectorAll('#cons-list .cons-item').forEach((btn, i) => {
            btn.classList.toggle('active', i === idx);
        });
    };

    window.showMsgDetails = (name, msgIdx) => {
        const msg = (consumerMessages[name] || [])[msgIdx];
        if (!msg) return;

        const detailInfo = document.getElementById('cons-msg-detail-info');
        const detailContent = document.getElementById('cons-msg-details-content');
        const msgCopyBtn = document.getElementById('cons-msg-copy-btn');

        let payload = msg.payload;
        if (typeof payload !== 'string') {
            payload = JSON.stringify(payload, null, 2);
        }

        const metadataEntries = Object.entries(msg.metadata || {}).sort(([a], [b]) => a.localeCompare(b));
        const metadataHtml = metadataEntries.length > 0
            ? `
                <div class="response-meta-block">
                    <div class="section-label">Headers</div>
                    ${metadataEntries.map(([k, v]) => `
                        <div class="response-meta-row">
                            <span class="response-meta-key">${k}</span>
                            <span class="response-meta-value">${String(v)}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="section-label">Body</div>
            `
            : '';

        detailContent.innerHTML = `${metadataHtml}<div id="cons-msg-payload"></div>`;
        const payloadContainer = detailContent.querySelector('#cons-msg-payload');
        payloadContainer.textContent = payload;
        payloadContainer.style.whiteSpace = 'pre-wrap';
        payloadContainer.style.fontFamily = 'var(--font)';
        payloadContainer.style.color = 'var(--text-payload)';

        // Update detail info (time, metadata if available)
        const uuidTime = msg.metadata?.id ? extractUuidV7Timestamp(msg.metadata.id) : null;
        const time = uuidTime || (msg.time ? new Date(msg.time).toLocaleTimeString() : 'N/A');
        detailInfo.textContent = `Message from ${time}`;
        if (msg.metadata && Object.keys(msg.metadata).length > 0) {
            detailInfo.textContent += ` (Metadata: ${Object.keys(msg.metadata).join(', ')})`;
        }

        msgCopyBtn.onclick = () => navigator.clipboard.writeText(payload);

        // Highlight selected row
        document.querySelectorAll('#consumer-log-body tr').forEach((row, i) => {
            row.classList.toggle('selected', i === msgIdx);
        });
    };

    // This function is called by index.html when the consumers tab is activated
    const restoreConsumerState = async (idx) => {
    if (consumers.length === 0) {
            // If no consumers, ensure the "add new" button is functional
        document.getElementById('cons-add').onclick = addConsumer;
        return;
    }

        setActiveItem(idx);
        await updateUI();
        startPolling();

        // Ensure the messages tab is active by default
        const msgTab = document.getElementById('ctab-msg');
        if (msgTab && !msgTab.classList.contains('active')) {
            msgTab.click();
        }
    };

    const updateUI = async () => {
        const idx = currentIdx;
        if (consumers.length === 0) return;

        updateUrlHash();
        const configFormContainer = document.getElementById('cons-config-form');
        if (!configFormContainer) return; // Should not happen if consumers.length > 0

        configFormContainer.innerHTML = '';
        const itemSchema = JSON.parse(JSON.stringify({ 
            ...schema.properties.consumers.items, 
            $defs: schema.$defs 
        }));
        applyEndpointSchemaDefaults(itemSchema);
        if (itemSchema.properties?.response) {
            itemSchema.properties.response.hidden = true;
        }
        if (consumers[idx]) await refreshConsumerStatuses();
        window._mqb_form_mode = 'consumer';
        try {
            await window.VanillaSchemaForms.init(configFormContainer, itemSchema, config.consumers[idx], (updated) => {
                updated.response = config.consumers[idx]?.response || null;
                config.consumers[idx] = updated;
                // Update name in sidebar list
                const label = document.querySelector(`#cons-list .cons-item[data-idx="${idx}"] .item-name`);
                if (label) label.textContent = updated.name;
                updateConsumerList(); // Update protocol badge
                renderConsumerResponseEditor(updated, idx);
            });
        } finally {
            window._mqb_form_mode = null;
        }
        renderConsumerResponseEditor(config.consumers[idx], idx);
        renderLiveLog();
    };

    const renderLiveLog = () => {
        if (consumers.length === 0) return;
        const name = consumers[currentIdx].name;
        const messages = consumerMessages[name] || [];
        const status = consumerStatus[name] || { running: false, status: { healthy: false } };

        const statusText = status.running 
            ? (status.status.healthy ? 'Connected' : `Connection Error: ${status.status.error || 'Unknown'}`)
            : 'Log Collector Stopped';
        const statusVariant = status.running
            ? (status.status.healthy ? 'success' : 'danger')
            : 'neutral';
        
        const toggleBtn = document.getElementById('cons-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = status.running ? 'Stop' : 'Start';
            toggleBtn.variant = status.running ? 'danger' : 'success';
            toggleBtn.loading = false;
        }

        const liveTitle = document.getElementById('cons-live-title');
        if (liveTitle) {
            liveTitle.innerHTML = `Incoming Messages: <wa-badge variant="${statusVariant}">${statusText}</wa-badge>`;
        }

        logBody.innerHTML = `
                            ${messages.length === 0 ? 
                                '<tr><td colspan="2" style="text-align:center; padding: 20px; color: var(--text-dim);">Waiting for messages...</td></tr>' : 
                                messages.map((m, mIdx) => {
                                    const uuidTime = m.metadata?.id ? extractUuidV7Timestamp(m.metadata.id) : null;
                                    const time = uuidTime || (m.time ? new Date(m.time).toLocaleTimeString() : 'N/A');
                                    const payload = typeof m.payload === 'string' ? m.payload : JSON.stringify(m.payload);
                                    return `<tr onclick="showMsgDetails('${name}', ${mIdx})" style="cursor: zoom-in;">
                                        <td class="text-muted small">${time}</td>
                                        <td class="font-monospace small text-break text-truncate" style="max-width: 400px;">${payload}</td>
                                    </tr>`;
                                }).join('')
                            }
        `;

        document.getElementById('cons-clear-history').onclick = () => {
            consumerMessages[name] = [];
            saveMessages();
            renderLiveLog();
            // Clear message details when history is cleared
            document.getElementById('cons-msg-details-content').textContent = '';
            document.getElementById('cons-msg-detail-info').textContent = 'Select a message to view details';
        };
        document.getElementById('cons-toggle').onclick = () => toggleConsumer(name);

        // Update badge in the sidebar list
        const currentConsItem = document.querySelector(`#cons-list .cons-item[data-idx="${currentIdx}"]`);
        if (currentConsItem) {
            const badge = currentConsItem.querySelector('.msg-count');
            if (badge) badge.textContent = messages.length || 0;
        }
    };

    consList.onclick = (e) => {
        const btn = e.target.closest('.cons-item');
        if (btn) {
            setActiveItem(parseInt(btn.getAttribute('data-idx')));
            updateUI();
        }
    };

    document.getElementById('cons-filter').oninput = (e) => {
        const val = e.target.value.toLowerCase();
        document.querySelectorAll('#cons-list .cons-item').forEach(btn => {
            const name = btn.querySelector('.item-name').textContent.toLowerCase();
            btn.style.display = name.includes(val) ? 'flex' : 'none';
        });
    };

    // Only set up add button if no consumers exist initially
    if (consumers.length === 0) {
        document.getElementById('cons-add').onclick = addConsumer;
    } else {
        // For existing consumers, these buttons are always present
        document.getElementById('cons-add').onclick = addConsumer;

        document.getElementById('cons-clone').onclick = () => {
            const current = config.consumers[currentIdx];
            const cloned = JSON.parse(JSON.stringify(current));
            cloned.name += '_copy';
            config.consumers.push(cloned);
            window.initConsumers(config, schema); // Re-initialize to re-render the whole UI
            setActiveItem(config.consumers.length - 1);
            updateUI();
        };

        document.getElementById('cons-delete').onclick = async () => {
            if (!await window.mqbConfirm("Delete this consumer?", "Delete Consumer")) return;
            config.consumers.splice(currentIdx, 1);
            if (config.consumers.length === 0) {
                await window.saveConfigSection('consumers', config.consumers, false);
            }
            window.initConsumers(config, schema); // Re-initialize to re-render the whole UI
            if (config.consumers.length > 0) {
                setActiveItem(Math.max(0, currentIdx - 1));
                updateUI();
            }
        };

        document.getElementById('cons-save').onclick = async (e) => {
            const selectedName = config.consumers[currentIdx]?.name || null;
            const saved = await window.saveConfigSection('consumers', config.consumers, false, e.currentTarget);
            if (!saved) return;

            const refreshedConfig = await window.fetchConfigFromServer();
            window.appConfig.consumers = refreshedConfig.consumers;
            window._mqb_saved_consumer_names = new Set(
                (refreshedConfig.consumers || []).map((consumer) => consumer.name),
            );
            window.initConsumers(window.appConfig, window.appSchema);

            const refreshedIdx = (window.appConfig.consumers || [])
                .findIndex((consumer) => consumer.name === selectedName);
            if (refreshedIdx !== -1) {
                window.restoreConsumerState(refreshedIdx);
            }
        };
    }


    // Sub-tab switching logic
    consSubTabs.querySelectorAll('.content-tab').forEach(tab => {
        tab.onclick = () => {
            consSubTabs.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
            document.getElementById('cons-def-panel').style.display = 'none';
            document.getElementById('cons-msg-panel').style.display = 'none';

            tab.classList.add('active');
            const target = document.getElementById(tab.dataset.target);
            if (target) {
                target.style.display = 'flex';
                if (tab.dataset.target === 'cons-msg-panel' && !window._consSplit && window.Split) {
                    // Initialize Split.js only when the messages panel is shown for the first time
                    window._consSplit = Split(['#cons-list-pane', '#cons-detail-pane'], {
                        direction: 'vertical', sizes: [60, 40], minSize: 100, gutterSize: 4,
                        elementStyle: (dimension, size, gutterSize) => ({
                            'flex-basis': `calc(${size}% - ${gutterSize}px)`,
                        }),
                        gutterStyle: (dimension, gutterSize) => ({
                            'flex-basis': `${gutterSize}px`,
                        }),
                    });
                }
            }
        };
    });

    const pollLoop = async () => {
        if (window._mqb_consumer_poll_nonce !== pollNonce) return;
        if (window._mqb_active_tab !== 'consumers') return;

        try {
            const currentConsumers = config.consumers || [];
            const activeConsumer = currentConsumers[currentIdx];
            if (!activeConsumer) {
                schedulePoll(1000);
                return;
            }

            await refreshConsumerStatuses();

            const name = activeConsumer.name;
            if (!consumerStatus[name]?.running) {
                schedulePoll(2000);
                return;
            }

            const res = await fetch(`/messages?consumer=${encodeURIComponent(name)}`);
            if (res.ok) {
                const data = await res.json();
                let hasNew = false;
                for (const [sourceName, msgs] of Object.entries(data)) {
                    if (!consumerMessages[sourceName]) consumerMessages[sourceName] = [];
                    consumerMessages[sourceName] = [...msgs, ...consumerMessages[sourceName]].slice(0, 1000);
                    hasNew = hasNew || msgs.length > 0;
                }
                if (hasNew) {
                    saveMessages();
                }
                renderLiveLog();
                updateConsumerList();
                document.querySelectorAll('#cons-list .cons-item').forEach(btn => {
                    const cName = btn.querySelector('.item-name').textContent;
                    const badge = btn.querySelector('.msg-count');
                    if (badge) badge.textContent = consumerMessages[cName]?.length || 0;
                });
            }
        } catch (e) {
            console.error("Polling error:", e);
        }

        schedulePoll(1000);
    };

    const startPolling = () => {
        schedulePoll(0);
    };

    // Mark as initialized and expose the restore function
    window._mqb_consumers_initialized = true;
    window.restoreConsumerState = restoreConsumerState;

    // Initial render of the sidebar list
    renderSidebar();

    // Initial setup if consumers exist
    if (consumers.length > 0) {
        // Default to the first consumer and messages tab
        setActiveItem(0);
        updateUI();
        startPolling();
        // Manually click the messages tab to ensure it's active and Split.js is initialized
        document.getElementById('ctab-msg').click();
    } else {
        // If no consumers, ensure the "add new" button is functional
        document.getElementById('cons-add').onclick = addConsumer;
    }
}
window.initConsumers = initConsumers;
