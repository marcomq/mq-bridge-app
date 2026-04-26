async function initConsumers(config, schema) {
    const h = window.VanillaSchemaForms.h;
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
    const hadDirtyTracker = Boolean(window._mqb_dirty_sections?.consumers);
    const settleInitialDirtyBaseline = () => {
        window.setTimeout(() => {
            window.markSectionSaved('consumers', config.consumers);
        }, 0);
    };
    window.registerDirtySection('consumers', {
        buttonId: 'cons-save',
        getValue: () => config.consumers,
    });
    const hadUnsavedChangesBeforeInit = window.refreshDirtySection('consumers');

    const updateUrlHash = () => {
        const idx = typeof currentIdx !== 'undefined' ? currentIdx : 0;
        window.history.replaceState(null, null, `#consumers:${idx}`);
    };

    // Load existing messages from LocalStorage
    let consumerMessages = JSON.parse(localStorage.getItem(MSG_STORAGE_KEY) || '{}');
    const saveMessages = () => localStorage.setItem(MSG_STORAGE_KEY, JSON.stringify(consumerMessages));

    let consumerStatus = {};
    if (!(window._mqb_saved_consumer_names instanceof Set)) {
        const savedConsumers = window._mqb_saved_sections?.consumers || consumers;
        window._mqb_saved_consumer_names = new Set((savedConsumers || []).map((consumer) => consumer.name));
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

    const cloneJson = (value) => JSON.parse(JSON.stringify(value));

    const nextPublisherName = (baseName) => {
        const existingNames = new Set((config.publishers || []).map((publisher) => publisher.name));
        let candidate = baseName;
        let index = 1;
        while (existingNames.has(candidate)) {
            candidate = `${baseName}_${index}`;
            index += 1;
        }
        return candidate;
    };

    const nextRouteName = (baseName) => {
        const existingNames = new Set(Object.keys(config.routes || {}));
        let candidate = baseName;
        let index = 1;
        while (existingNames.has(candidate)) {
            candidate = `${baseName}_${index}`;
            index += 1;
        }
        return candidate;
    };

    const createEmptyRouteConfig = () => ({
        enabled: true,
        input: { middlewares: defaultMetricsMiddleware(), null: null },
        output: { middlewares: defaultMetricsMiddleware(), null: null },
    });

    const openConsumerAt = (idx, tab = 'messages') => {
        window._mqb_pending_consumer_restore = { idx, tab };
        window.history.replaceState(null, null, `#consumers:${idx}`);
        if (window.switchMain) {
            window.switchMain('consumers');
            window.setTimeout(() => {
                window.restoreConsumerState?.(idx, { tab });
            }, 0);
            return;
        }
        window.initConsumers(config, schema);
        if (window.restoreConsumerState) {
            window.restoreConsumerState(idx, { tab });
        }
    };

    const openPublisherAt = (idx, tab = 'payload') => {
        window._mqb_pending_publisher_restore = { idx, tab };
        window.history.replaceState(null, null, `#publishers:${idx}`);
        if (window.switchMain) {
            window.switchMain('publishers');
            window.setTimeout(() => {
                window.restorePublisherState?.(idx, { tab });
            }, 0);
            return;
        }
        window.initPublishers(config, window.appSchema);
        if (window.restorePublisherState) {
            window.restorePublisherState(idx, { tab });
        }
    };

    const openRouteAt = (routeName) => {
        const routeIdx = Object.keys(config.routes || {}).indexOf(routeName);
        if (routeIdx === -1) return;
        window._mqb_pending_route_restore = { idx: routeIdx };
        window.history.replaceState(null, null, `#routes:${routeIdx}`);
        if (window.switchMain) {
            window.switchMain('routes');
            window.setTimeout(() => {
                window.restoreRouteState?.(routeIdx);
            }, 0);
            return;
        }
        window.initRoutes(config, window.appSchema);
        if (window.restoreRouteState) {
            window.restoreRouteState(routeIdx);
        }
    };

    const copyCurrentConsumer = async () => {
        const current = config.consumers[currentIdx];
        if (!current) return;

        const choice = await window.mqbChoose(
            "Choose where to copy this consumer definition.",
            "Copy Consumer",
            {
                confirmLabel: 'Continue',
                choices: [
                    { value: 'route_input', label: 'New Route Input' },
                    { value: 'publisher', label: 'New Publisher (review required)' },
                    { value: 'ref', label: 'New Ref Consumer' },
                ],
            },
        );
        if (!choice) return;

        if (choice === 'route_input') {
            const routeName = await window.mqbPrompt(
                "Choose a name for the new route. The output stays null until you review it.",
                "Copy to Route",
                {
                    confirmLabel: 'Create',
                    value: nextRouteName(`${current.name}_route`),
                    placeholder: 'consumer_route',
                },
            );
            if (!routeName) return;
            if (config.routes[routeName]) return window.mqbAlert("Route already exists");

            const routeConfig = createEmptyRouteConfig();
            routeConfig.input = cloneJson(current.endpoint);
            config.routes[routeName] = routeConfig;
            window.refreshDirtySection('routes');
            openRouteAt(routeName);
            return;
        }

        if (choice === 'publisher') {
            const publisherName = await window.mqbPrompt(
                "Choose a name for the new publisher. Consumer-specific fields may need adjustment after copying.",
                "Copy to Publisher",
                {
                    confirmLabel: 'Create',
                    value: nextPublisherName(`${current.name}_publisher`),
                    placeholder: 'consumer_publisher',
                },
            );
            if (!publisherName) return;
            if ((config.publishers || []).some((publisher) => publisher.name === publisherName)) {
                return window.mqbAlert("Publisher already exists");
            }

            config.publishers.push({
                name: publisherName,
                endpoint: cloneJson(current.endpoint),
                comment: current.comment || '',
            });
            window.refreshDirtySection('publishers');
            openPublisherAt(config.publishers.length - 1, 'definition');
            return;
        }

        const refTarget = await window.mqbPrompt(
            'Enter the ref target name. This must match a registered endpoint name at runtime.',
            'Copy as Ref Consumer',
            {
                confirmLabel: 'Next',
                value: current.name,
                placeholder: 'route_or_ref_name',
            },
        );
        if (!refTarget) return;

        const consumerName = await window.mqbPrompt(
            'Choose a name for the new ref consumer.',
            'Copy as Ref Consumer',
            {
                confirmLabel: 'Create',
                value: nextConsumerName('ref'),
                placeholder: 'ref_consumer',
            },
        );
        if (!consumerName) return;
        if ((config.consumers || []).some((consumer) => consumer.name === consumerName)) {
            return window.mqbAlert("Consumer already exists");
        }

        config.consumers.push({
            name: consumerName,
            endpoint: { ref: refTarget },
            comment: current.comment || '',
            response: null,
        });
        window.refreshDirtySection('consumers');
        openConsumerAt(config.consumers.length - 1);
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

    const createResponseMetaRow = (key, value) => {
        return h(
            'div',
            { className: 'response-meta-row' },
            h('span', { className: 'response-meta-key' }, String(key)),
            h('span', { className: 'response-meta-value' }, String(value)),
        );
    };

    const createResponseMetaBlock = (title, entries) => {
        const block = h('div', { className: 'response-meta-block' }, h('div', { className: 'section-label' }, title));
        entries.forEach(([key, value]) => block.appendChild(createResponseMetaRow(key, value)));
        return block;
    };

    const createSidebarItem = (consumer, index) => {
        const proto = getConsumerInputType(consumer).toUpperCase();
        const status = consumerStatus[consumer.name];
        const statusClass = status
            ? (status.running ? (status.status?.healthy ? 'status-ok' : 'status-err') : 'status-off')
            : 'status-off';

        const countNode = h('span', { className: 'msg-count' }, String(consumerMessages[consumer.name]?.length || 0));
        countNode.style.marginLeft = 'auto';

        return h(
            'div',
            { className: 'sidebar-item cons-item', 'data-idx': String(index) },
            h('span', { className: `proto-badge proto-${proto.toLowerCase()}` }, proto),
            h('span', { className: 'item-name' }, consumer.name),
            countNode,
            h('span', { className: `item-status ${statusClass}` }),
        );
    };

    const renderConsumerResponseEditor = (consumer, idx) => {
        const container = document.getElementById('cons-response-editor');
        const responseTab = document.getElementById('cons-response-tab');
        const responsePanel = document.getElementById('cons-response-panel');
        if (!container) return;

        if (!consumerSupportsCustomResponse(consumer)) {
            if (responseTab) responseTab.style.display = 'none';
            if (responsePanel) responsePanel.style.display = 'none';
            container.style.display = 'none';
            container.innerHTML = '';
            config.consumers[idx].response = null;
            if (responseTab?.classList.contains('active')) {
                document.getElementById('ctab-def')?.click();
            }
            return;
        }

        const normalizedResponse = normalizeConsumerResponse(consumer.response);
        const response = normalizedResponse || { headers: {}, payload: '' };

        const headerRows = Object.entries(response.headers).sort(([a], [b]) => a.localeCompare(b));
        if (responseTab) responseTab.style.display = 'flex';
        container.style.display = 'block';
        const toolbar = h(
            'div',
            { className: 'section-toolbar response-editor-header' },
            h('div', { className: 'section-label' }, 'Custom Response'),
            h('span', { className: 'form-description' }, 'Returned to request-response consumer endpoints after the message is logged.'),
        );

        const grid = h('div', { className: 'response-editor-grid' });
        const headersLabel = h('div', { className: 'section-label' }, 'Headers');
        const headersContainer = h('div', { id: 'cons-response-headers' });

        const syncResponseState = () => {
            const headers = {};
            container.querySelectorAll('.response-header-row').forEach((row) => {
                const key = row.querySelector('.cons-response-header-key')?.value?.trim() || '';
                const value = row.querySelector('.cons-response-header-value')?.value?.trim() || '';
                if (key && value) headers[key] = value;
            });
            const payload = container.querySelector('#cons-response-payload')?.value || '';
            config.consumers[idx].response = normalizeConsumerResponse({ headers, payload });
            window.refreshDirtySection('consumers');
        };

        const appendHeaderRow = (key = '', value = '') => {
            const keyInput = h('input', {
                className: 'field-input cons-response-header-key',
                type: 'text',
                placeholder: 'Header name',
            });
            keyInput.value = key;

            const valueInput = h('input', {
                className: 'field-input cons-response-header-value',
                type: 'text',
                placeholder: 'Header value',
            });
            valueInput.value = value;

            const deleteButton = h('wa-button', { className: 'cons-response-header-delete' }, 'Delete');
            deleteButton.setAttribute('variant', 'neutral');
            deleteButton.setAttribute('appearance', 'outlined');
            deleteButton.setAttribute('size', 'small');

            const row = h(
                'div',
                { className: 'response-header-row' },
                keyInput,
                valueInput,
                deleteButton,
            );

            deleteButton.onclick = (event) => {
                event.preventDefault();
                row.remove();
                syncResponseState();
            };

            [keyInput, valueInput].forEach((input) => {
                input.addEventListener('input', syncResponseState);
            });

            headersContainer.appendChild(row);
            return row;
        };

        headerRows.forEach(([key, value]) => appendHeaderRow(key, value));

        const addHeaderButton = h('wa-button', { id: 'cons-response-add-header' }, 'Add Header');
        addHeaderButton.setAttribute('variant', 'neutral');
        addHeaderButton.setAttribute('appearance', 'outlined');
        addHeaderButton.setAttribute('size', 'small');
        const actions = h('div', { className: 'response-editor-actions' }, addHeaderButton);

        const payloadInput = h('textarea', {
            className: 'body-editor',
            id: 'cons-response-payload',
            placeholder: 'Response body',
        });
        payloadInput.spellcheck = false;
        payloadInput.value = response.payload;

        grid.append(
            headersLabel,
            headersContainer,
            actions,
            h('div', { className: 'section-label' }, 'Payload'),
            payloadInput,
        );
        container.replaceChildren(toolbar, grid);
        addHeaderButton.onclick = (event) => {
            event.preventDefault();
            const row = appendHeaderRow('', '');
            syncResponseState();
            row.querySelector('.cons-response-header-key')?.focus();
        };

        payloadInput.addEventListener('input', syncResponseState);
    };

    const renderSidebar = () => {
        const list = document.getElementById('cons-list');
        if (!list) return;
        list.replaceChildren(
            h('div', { className: 'sidebar-group-label' }, 'Saved'),
            ...consumers.map((consumer, index) => createSidebarItem(consumer, index)),
        );
        
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
        const detailChildren = [];
        if (metadataEntries.length > 0) {
            detailChildren.push(createResponseMetaBlock('Headers', metadataEntries));
            detailChildren.push(h('div', { className: 'section-label' }, 'Body'));
        }

        const payloadContainer = h('div', { id: 'cons-msg-payload' });
        detailChildren.push(payloadContainer);
        detailContent.replaceChildren(...detailChildren);
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
    const restoreConsumerState = async (idx, options = {}) => {
    if (consumers.length === 0) {
            // If no consumers, ensure the "add new" button is functional
        document.getElementById('cons-add').onclick = addConsumer;
        return;
    }

        setActiveItem(idx);
        await updateUI();
        const activeConsumer = consumers[idx];
        if (activeConsumer && isSavedConsumer(activeConsumer.name)) {
            startPolling();
        }

        const targetTab = options.tab || 'messages';
        const tabId = targetTab === 'definition'
            ? 'ctab-def'
            : targetTab === 'response'
                ? 'cons-response-tab'
                : 'ctab-msg';
        const target = document.getElementById(tabId);
        if (target && !target.classList.contains('active')) {
            target.click();
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
        const httpConfigSchema = itemSchema.$defs?.HttpConfig;
        if (httpConfigSchema?.properties?.custom_headers) {
            httpConfigSchema.properties.custom_headers.hidden = true;
        }
        if (consumers[idx] && isSavedConsumer(consumers[idx].name)) await refreshConsumerStatuses();
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
                window.refreshDirtySection('consumers');
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
            const badge = h('wa-badge', {}, statusText);
            badge.setAttribute('variant', statusVariant);
            liveTitle.replaceChildren('Incoming Messages: ', badge);
        }

        if (messages.length === 0) {
            const cell = h('td', {}, 'Waiting for messages...');
            cell.colSpan = 2;
            cell.style.textAlign = 'center';
            cell.style.padding = '20px';
            cell.style.color = 'var(--text-dim)';
            const row = h('tr', {}, cell);
            logBody.replaceChildren(row);
        } else {
            const rows = messages.map((message, msgIdx) => {
                const row = h('tr', {});
                row.style.cursor = 'zoom-in';
                row.addEventListener('click', () => window.showMsgDetails(name, msgIdx));

                const uuidTime = message.metadata?.id ? extractUuidV7Timestamp(message.metadata.id) : null;
                const timeCell = h(
                    'td',
                    { className: 'text-muted small' },
                    uuidTime || (message.time ? new Date(message.time).toLocaleTimeString() : 'N/A'),
                );

                const payloadCell = h(
                    'td',
                    { className: 'font-monospace small text-break text-truncate' },
                    typeof message.payload === 'string' ? message.payload : JSON.stringify(message.payload),
                );
                payloadCell.style.maxWidth = '400px';

                row.append(timeCell, payloadCell);
                return row;
            });
            logBody.replaceChildren(...rows);
        }

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
        document.getElementById('cons-copy').onclick = copyCurrentConsumer;

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
            document.getElementById('cons-response-panel').style.display = 'none';
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
        const pendingRestore = window._mqb_pending_consumer_restore || null;
        window._mqb_pending_consumer_restore = null;
        const initialIdx = pendingRestore?.idx ?? 0;
        const initialTab = pendingRestore?.tab || 'messages';

        setActiveItem(initialIdx);
        updateUI().then(() => {
            if (!hadDirtyTracker && !hadUnsavedChangesBeforeInit) {
                settleInitialDirtyBaseline();
            }
        });
        const initialConsumer = consumers[initialIdx];
        if (initialConsumer && isSavedConsumer(initialConsumer.name)) {
            startPolling();
        }
        const tabId = initialTab === 'definition'
            ? 'ctab-def'
            : initialTab === 'response'
                ? 'cons-response-tab'
                : 'ctab-msg';
        document.getElementById(tabId)?.click();
    } else {
        if (!hadDirtyTracker && !hadUnsavedChangesBeforeInit) {
            settleInitialDirtyBaseline();
        }
        // If no consumers, ensure the "add new" button is functional
        document.getElementById('cons-add').onclick = addConsumer;
        document.getElementById('cons-copy').onclick = copyCurrentConsumer;
    }
}
window.initConsumers = initConsumers;
