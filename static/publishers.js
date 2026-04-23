function initPublishers(config, schema) {
    const container = document.getElementById('publishers-container');
    const publishers = config.publishers || [];
    const STORAGE_KEY = 'mqb_publisher_state';
    const HISTORY_KEY = 'mqb_publisher_history';

    let appState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

    const updateUrlHash = () => {
        const idx = typeof currentIdx !== 'undefined' ? currentIdx : 0;
        window.history.replaceState(null, null, `#publishers:${idx}`);
    };

    const saveAppState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    const saveHistory = () => {
        history = history.slice(0, 1000); // Keep last 1000 entries
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    };

    const sortEntries = (obj) =>
        Object.entries(obj || {}).sort(([a], [b]) => a.localeCompare(b));

    const defaultHttpConfig = () => ({
        url: '',
        tls: {
            required: false,
            accept_invalid_certs: false,
        },
        fire_and_forget: false,
        compression_enabled: false,
        basic_auth: ['', ''],
        custom_headers: {},
    });

    const REQUEST_BAR_BINDINGS = {
        http: { field: 'url', label: 'URL', placeholder: 'https://example.com/api' },
        kafka: { field: 'url', label: 'BROKERS', placeholder: 'kafka:9092' },
        mqtt: { field: 'url', label: 'BROKER', placeholder: 'tcp://localhost:1883' },
        grpc: { field: 'url', label: 'URL', placeholder: 'http://localhost:50051' },
        amqp: { field: 'url', label: 'URL', placeholder: 'amqp://guest:guest@localhost:5672/%2f' },
        ibmmq: { field: 'url', label: 'URL', placeholder: 'mq-host(1414)' },
        nats: { field: 'url', label: 'SERVERS', placeholder: 'nats://localhost:4222' },
        mongodb: { field: 'url', label: 'URL', placeholder: 'mongodb://localhost:27017' },
        zeromq: { field: 'url', label: 'URL', placeholder: 'tcp://127.0.0.1:5555' },
        file: { field: 'path', label: 'PATH', placeholder: '/tmp/messages.jsonl' },
        memory: { field: 'topic', label: 'TOPIC', placeholder: 'events' },
        sled: { field: 'path', label: 'PATH', placeholder: './data/sled' },
    };

    const SCHEMA_REQUEST_BAR_FIELDS = {
        HttpConfig: ['url', 'custom_headers'],
        KafkaConfig: ['url'],
        MqttConfig: ['url'],
        GrpcConfig: ['url'],
        AmqpConfig: ['url'],
        IbmMqConfig: ['url'],
        NatsConfig: ['url'],
        MongoDbConfig: ['url'],
        ZeroMqConfig: ['url'],
        FileConfig: ['path'],
        MemoryConfig: ['topic'],
        SledConfig: ['path'],
    };

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

    const HTTP_METHOD_OPTIONS = ['POST', 'GET', 'PUT', 'DELETE'];

    const endpointTypeKeys = [
        'http',
        'kafka',
        'mqtt',
        'grpc',
        'amqp',
        'ibmmq',
        'nats',
        'aws',
        'file',
        'static',
        'memory',
        'mongodb',
        'sled',
        'htmx',
        'ref',
        'zeromq',
        'switch',
        'response',
        'custom',
        'null',
    ];

    const getEndpointType = (publisher) => {
        const endpoint = publisher?.endpoint || {};
        return endpointTypeKeys.find((key) => key in endpoint) || 'null';
    };

    const ensureHttpConfig = (publisher) => {
        publisher.endpoint ||= {};
        if (!publisher.endpoint.http || typeof publisher.endpoint.http !== 'object') {
            publisher.endpoint.http = defaultHttpConfig();
        }
        publisher.endpoint.http.custom_headers ||= {};
        return publisher.endpoint.http;
    };

    const ensureEndpointConfig = (publisher, endpointType) => {
        if (endpointType === 'http') {
            return ensureHttpConfig(publisher);
        }

        publisher.endpoint ||= {};
        if (!publisher.endpoint[endpointType] || typeof publisher.endpoint[endpointType] !== 'object') {
            publisher.endpoint[endpointType] = {};
        }
        return publisher.endpoint[endpointType];
    };

    const getRequestBarBinding = (endpointType) => REQUEST_BAR_BINDINGS[endpointType] || null;

    const getRequestBarValue = (publisher) => {
        const endpointType = getEndpointType(publisher);
        const binding = getRequestBarBinding(endpointType);
        if (!binding) return '';

        const endpointConfig = ensureEndpointConfig(publisher, endpointType);
        return typeof endpointConfig?.[binding.field] === 'string' ? endpointConfig[binding.field] : '';
    };

    const setRequestBarValue = (publisher, rawValue) => {
        const endpointType = getEndpointType(publisher);
        const binding = getRequestBarBinding(endpointType);
        if (!binding) return;

        const endpointConfig = ensureEndpointConfig(publisher, endpointType);
        endpointConfig[binding.field] = rawValue;
    };

    const setMethodSelectMode = (methodSelect, endpointType) => {
        if (!methodSelect) return;

        if (endpointType === 'http') {
            methodSelect.innerHTML = HTTP_METHOD_OPTIONS
                .map((method) => `<option>${method}</option>`)
                .join('');
            methodSelect.value = 'POST';
            methodSelect.disabled = false;
            methodSelect.title = 'HTTP publishers currently send POST requests.';
            return;
        }

        const binding = getRequestBarBinding(endpointType);
        const label = binding?.label || 'TARGET';
        methodSelect.innerHTML = `<option>${label}</option>`;
        methodSelect.value = label;
        methodSelect.disabled = true;
        methodSelect.title = `Quick access field for the ${endpointType.toUpperCase()} publisher configuration.`;
    };

    const syncPublisherSidebar = () => {
        document.querySelectorAll('#pub-list .pub-item').forEach((btn, i) => {
            const publisher = publishers[i];
            const type = getEndpointType(publisher).toUpperCase();
            const badge = btn.querySelector('.proto-badge');
            if (badge) {
                badge.textContent = type;
                badge.className = `proto-badge proto-${type.toLowerCase()}`;
            }
        });
    };

    const syncRequestBar = () => {
        const pub = publishers[currentIdx];
        if (!pub) return;

        const protocolSelect = document.getElementById('pub-proto');
        const methodSelect = document.getElementById('pub-method');
        const urlInput = document.getElementById('pub-url');
        const endpointType = getEndpointType(pub);
        const binding = getRequestBarBinding(endpointType);

        if (protocolSelect) {
            const protocolValue = endpointType === 'ibmmq' ? 'MQ' : endpointType.toUpperCase();
            protocolSelect.value = ['HTTP', 'KAFKA', 'MQTT', 'GRPC', 'AMQP', 'MQ'].includes(protocolValue)
                ? protocolValue
                : 'HTTP';
            protocolSelect.disabled = true;
        }

        setMethodSelectMode(methodSelect, endpointType);

        if (urlInput) {
            urlInput.value = getRequestBarValue(pub);
            urlInput.disabled = !binding;
            urlInput.placeholder = binding?.placeholder || 'No quick-access field for this publisher type';
            urlInput.title = binding
                ? `${binding.label} for this ${endpointType.toUpperCase()} publisher`
                : `No quick-access field is configured for ${endpointType.toUpperCase()} publishers.`;
        }
    };

    const buildHttpRequestMetadata = () => {
        const pub = publishers[currentIdx];
        if (!pub || getEndpointType(pub) !== 'http') {
            return {};
        }

        const urlInput = document.getElementById('pub-url');
        const methodSelect = document.getElementById('pub-method');
        const rawUrl = (urlInput?.value || '').trim();
        const metadata = {};

        if (methodSelect?.value) {
            metadata.http_method = methodSelect.value;
        }

        if (!rawUrl) {
            return metadata;
        }

        try {
            const parsed = new URL(rawUrl);
            metadata.http_path = parsed.pathname || '/';
            if (parsed.search.length > 1) {
                metadata.http_query = parsed.search.slice(1);
            }
        } catch (_) {
            const slashIndex = rawUrl.indexOf('/', rawUrl.indexOf('//') + 2);
            if (slashIndex >= 0) {
                const pathWithQuery = rawUrl.slice(slashIndex);
                const [path, query] = pathWithQuery.split('?');
                metadata.http_path = path || '/';
                if (query) metadata.http_query = query;
            }
        }

        return metadata;
    };

    const applyHistoryRequestToPublisher = (publisher, item) => {
        if (!publisher || getEndpointType(publisher) !== 'http') {
            return;
        }

        const httpConfig = ensureHttpConfig(publisher);
        httpConfig.custom_headers = Object.fromEntries(
            (item.metadata || []).map(({ k, v }) => [k, v]),
        );

        if (typeof item.url === 'string') {
            httpConfig.url = item.url;
            return;
        }

        const existingUrl = httpConfig.url || '';
        const requestMetadata = item.requestMetadata || {};
        const methodSelect = document.getElementById('pub-method');
        if (methodSelect && requestMetadata.http_method) {
            methodSelect.value = requestMetadata.http_method;
        }

        if (!requestMetadata.http_path && !requestMetadata.http_query) {
            return;
        }

        try {
            const parsed = new URL(existingUrl);
            parsed.pathname = requestMetadata.http_path || '/';
            parsed.search = requestMetadata.http_query ? `?${requestMetadata.http_query}` : '';
            httpConfig.url = parsed.toString();
        } catch (_) {
            const path = requestMetadata.http_path || '/';
            const query = requestMetadata.http_query ? `?${requestMetadata.http_query}` : '';
            httpConfig.url = `${path}${query}`;
        }
    };

    // This function will be called by index.html's switchMain
    // It should only update the UI for the publishers tab, not manage main tab state
    const restorePublisherState = (idx) => {
        if (publishers[idx]) {
            if (currentIdx !== idx) {
                setActiveItem(idx);
            }
            updateUIFromState();
        }
    };

    const getPublisherState = (name) => {
        if (!appState[name]) {
            appState[name] = { payload: '{\n  "hello": "world"\n}' };
        }
        return appState[name];
    };
    container.style.display = 'contents';

    const pubList = document.getElementById('pub-list');
    const payloadArea = document.getElementById('pub-payload');
    const metaContainer = document.getElementById('metadata-container')?.querySelector('tbody');
    const responseDiv = document.getElementById('pub-response');
    const pubSubTabs = document.getElementById('pub-sub-tabs');
    let currentIdx = 0;

    const renderSidebar = () => {
        if (!pubList) return;
        pubList.innerHTML = '<div class="sidebar-group-label">Saved</div>' +
            publishers.map((p, i) => `
                <div class="sidebar-item pub-item" data-idx="${i}">
                    <span class="proto-badge proto-http">HTTP</span>
                    <span class="item-name">${p.name}</span>
                    <span class="item-status status-off"></span>
                </div>
            `).join('');

        const hasPubs = publishers.length > 0;
        document.getElementById('pub-empty-alert').style.display = hasPubs ? 'none' : 'block';
        document.getElementById('pub-main-ui').style.display = hasPubs ? 'contents' : 'none';
    };

    // Initial render of the sidebar
    renderSidebar();

    // Split.js instance for the publisher pane
    let pubSplit;

    const setActiveItem = (idx) => {
        currentIdx = idx;
        document.querySelectorAll('#pub-list .pub-item').forEach((btn, i) => {
            btn.classList.toggle('active', i === idx);
        });
    };

    const updateUIFromState = async () => {
        if (publishers.length === 0) return;
        const idx = currentIdx;

        // Reset response UI instead of hiding the container to preserve the split layout
        const statusTarget = document.getElementById("pub-response-status");
        const responseBody = document.getElementById("pub-response");
        const responseTab = document.getElementById("pub-response-tab");
        if (statusTarget) statusTarget.textContent = 'Ready';
        if (responseBody) responseBody.textContent = '';
        if (responseTab) responseTab.style.display = 'none';

        const pub = publishers[idx];
        const s = getPublisherState(pub.name);
        if (payloadArea) payloadArea.value = s.payload;
        if (metaContainer) {
            metaContainer.innerHTML = '';
            const httpConfig = getEndpointType(pub) === 'http' ? ensureHttpConfig(pub) : null;
            sortEntries(httpConfig?.custom_headers).forEach(([k, v]) => addMetadataRow(k, v));
        }
        syncRequestBar();
        syncPublisherSidebar();
        renderHistory();
        
        // Init Config Form
        const configFormContainer = document.getElementById('pub-config-form');
        if (!configFormContainer) return;
        configFormContainer.innerHTML = '';
        const itemSchema = JSON.parse(JSON.stringify({ 
            ...schema.properties.publishers.items, 
            $defs: schema.$defs 
        }));
        applyEndpointSchemaDefaults(itemSchema);
        Object.entries(SCHEMA_REQUEST_BAR_FIELDS).forEach(([defName, fields]) => {
            const endpointSchema = itemSchema.$defs?.[defName];
            if (!endpointSchema?.properties) return;

            fields.forEach((fieldName) => {
                if (endpointSchema.properties[fieldName]) {
                    endpointSchema.properties[fieldName].hidden = true;
                }
                if (Array.isArray(endpointSchema.required)) {
                    endpointSchema.required = endpointSchema.required.filter((key) => key !== fieldName);
                }
            });
        });
        const httpConfigSchema = itemSchema.$defs?.HttpConfig;
        if (httpConfigSchema?.properties) {
            if (httpConfigSchema.properties.custom_headers) {
                httpConfigSchema.properties.custom_headers.hidden = true;
            }
        }
        await window.VanillaSchemaForms.init(configFormContainer, itemSchema, publishers[idx], (updated) => {
            publishers[idx] = updated;
            const label = document.querySelector(`#pub-list .pub-item[data-idx="${idx}"] .item-name`);
            if (label) label.textContent = updated.name;
            syncRequestBar();
            syncPublisherSidebar();
        });
    };

    const updateStateFromUI = () => {
        if (publishers.length === 0) return;
        const pub = publishers[currentIdx];
        const s = getPublisherState(pub.name);
        if (payloadArea) s.payload = payloadArea.value;
        const urlInput = document.getElementById('pub-url');
        setRequestBarValue(pub, urlInput?.value.trim() || '');

        const endpointType = getEndpointType(pub);
        if (endpointType === 'http') {
            const httpConfig = ensureHttpConfig(pub);
            const customHeaders = {};
            if (metaContainer) {
                metaContainer.querySelectorAll('tr').forEach(row => {
                    const k = row.querySelector('.kv-input.meta-key')?.value.trim();
                    const v = row.querySelector('.kv-input.meta-val')?.value.trim() || '';
                    if (k) customHeaders[k] = v;
                });
            }
            httpConfig.custom_headers = customHeaders;
        }
        saveAppState();
    };

    const addMetadataRow = (k = '', v = '') => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="kv-input meta-key" placeholder="Key" value="${k}"></td>
            <td><input type="text" class="kv-input meta-val" placeholder="Value" value="${v}"></td>
            <td><div class="btn-icon remove-meta">&times;</div></td>`;
        metaContainer.appendChild(row);
        row.querySelector('.remove-meta').onclick = () => {
            row.remove();
            updateStateFromUI();
        };
        row.querySelectorAll('input').forEach(i => i.oninput = updateStateFromUI);
    };

    const formatResponseDetails = (status, statusText, duration, data, requestInfo = {}) => {
        const statusTarget = document.getElementById("pub-response-status"); // Removed responseContainer from here
        const responseBody = document.getElementById("pub-response");
        const responseContainer = document.getElementById("pub-response-container");
        const copyBtn = document.getElementById("pub-resp-copy");

        if (!statusTarget || !responseBody || !responseContainer) return;

        const statusColor = status < 300 ? "var(--accent-http)" : "var(--accent-kafka)";
        
        // Calculate approximate size
        const payloadStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        const size = new TextEncoder().encode(payloadStr).length;
        const sizeStr = size > 1024 ? (size/1024).toFixed(2) + ' KB' : size + ' B';

        statusTarget.innerHTML = `
            <span style="color:${statusColor}; font-weight: bold; padding: 2px 4px; border-radius: 3px; background: rgba(0,0,0,0.2)">${status} ${statusText}</span>
            <span style="margin-left:12px; opacity: 0.8;">Time: <strong style="color:var(--text-primary)">${duration}ms</strong></span>
            <span style="margin-left:12px; opacity: 0.8;">Size: <strong style="color:var(--text-primary)">${sizeStr}</strong></span>
        `;

        let payloadContent = "";
        let responseMetaHtml = "";
        let requestMetaHtml = "";

        const requestHeaders = Array.isArray(requestInfo.headers) ? requestInfo.headers : [];
        const requestRows = [];
        if (requestInfo.method) requestRows.push(["Method", requestInfo.method]);
        if (requestInfo.url) requestRows.push([requestInfo.targetLabel || "URL", requestInfo.url]);
        if (requestInfo.path) requestRows.push(["Path", requestInfo.path]);
        if (requestInfo.query) requestRows.push(["Query", requestInfo.query]);

        if (requestRows.length > 0 || requestHeaders.length > 0) {
            requestMetaHtml = `
                <div class="response-meta-block">
                    <div class="section-label">Request</div>
                    ${requestRows.map(([k, v]) => `
                        <div class="response-meta-row">
                            <span class="response-meta-key">${k}</span>
                            <span class="response-meta-value">${String(v)}</span>
                        </div>
                    `).join('')}
                    ${requestHeaders.length > 0 ? `
                        <div class="section-label" style="margin-top:10px;">Headers</div>
                        ${requestHeaders.map(({ k, v }) => `
                            <div class="response-meta-row">
                                <span class="response-meta-key">${k}</span>
                                <span class="response-meta-value">${String(v)}</span>
                            </div>
                        `).join('')}
                    ` : ''}
                </div>
            `;
        }

        if (data && typeof data === "object") {
            const isResponse = data.status === "Response" || (data.metadata && data.payload);
            if (isResponse) {
                const sortedHeaders = sortEntries(data.metadata);
                if (sortedHeaders.length > 0) {
                    responseMetaHtml = `
                        <div class="response-meta-block">
                            <div class="section-label">Response Headers</div>
                            ${sortedHeaders.map(([k, v]) => `
                                <div class="response-meta-row">
                                    <span class="response-meta-key">${k}</span>
                                    <span class="response-meta-value">${String(v)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="section-label">Body</div>
                    `;
                }
                payloadContent = typeof data.payload === 'string' ? data.payload : JSON.stringify(data.payload, null, 2);
            } else if (data.status === "Ack") {
                payloadContent = "// ACKNOWLEDGED: The backend processed the message successfully.";
            } else {
                payloadContent = JSON.stringify(data, null, 2);
            }
        } else {
            payloadContent = String(data || "");
        }

        responseBody.innerHTML = requestMetaHtml + responseMetaHtml + `<div id="pub-actual-payload"></div>`;
        const payloadContainer = responseBody.querySelector("#pub-actual-payload");
        payloadContainer.textContent = payloadContent;
        payloadContainer.style.whiteSpace = 'pre-wrap';
        payloadContainer.style.fontFamily = 'var(--font)';
        payloadContainer.style.color = '#a8d8a8';

        if (copyBtn) copyBtn.onclick = () => navigator.clipboard.writeText(payloadContent);

        // Update response tab indicator to match concept
        const responseTab = document.getElementById("pub-response-tab");
        if (responseTab) {
            responseTab.style.display = 'flex';
            responseTab.style.color = statusColor;
            responseTab.textContent = `Response ✓ ${status}`;
        }

        // Ensure split.js is initialized for the publisher pane
        if (!pubSplit) {
            pubSplit = Split(['#pub-top-content-wrapper', '#pub-response-container'], {
                direction: 'vertical',
                sizes: [60, 40],
                minSize: 100,
                gutterSize: 4,
                elementStyle: (dimension, size, gutterSize) => ({
                    'flex-basis': `calc(${size}% - ${gutterSize}px)`,
                }),
                gutterStyle: (dimension, gutterSize) => ({
                    'flex-basis': `${gutterSize}px`,
                }),
            });
        }
    };

    const renderHistory = () => {
        const historyContainer = document.getElementById('pub-history-pane');
        if (!historyContainer) return;
        const name = publishers[currentIdx]?.name;
        const filteredHistory = history.filter(item => item.name === name);

        historyContainer.innerHTML = `
            <div class="section-toolbar">
                <span class="section-label">Execution History</span>
                <button class="btn-clear" id="pub-clear-history">Clear</button>
            </div>
            <div style="overflow:auto;flex:1">
                <table class="msg-table">
                    <thead>
                        <tr>
                            <th style="width: 100px;">Time</th>
                            <th style="width: 80px;">Status</th>
                            <th>Payload Preview</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredHistory.length === 0 ? 
                            '<tr><td colspan="3" style="text-align:center; padding: 20px; color: var(--text-dim);">No history for this publisher.</td></tr>' : 
                            filteredHistory.map((item) => {
                                const statusClass = item.status < 300 ? 'status-ok' : 'status-err'; // Using custom classes
                                const time = new Date(item.time).toLocaleTimeString();
                                const payload = item.payload.substring(0, 100).replace(/\n/g, ' ');
                                return `<tr class="history-row" data-hidx="${history.indexOf(item)}" style="cursor: zoom-in;">
                                    <td class="ts">${time}</td>
                                    <td><span class="${statusClass} small fw-bold">${item.status}</span></td>
                                    <td class="preview">${payload}</td>
                                </tr>`;
                            }).join('')
                        }
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('pub-clear-history').onclick = () => {
            history = history.filter(item => item.name !== name);
            saveHistory();
            renderHistory();
            document.getElementById('pub-response-container').style.display = 'none';
        };

        historyContainer.querySelectorAll('.history-row').forEach(row => {
            row.onclick = async () => {
                const item = history[parseInt(row.getAttribute('data-hidx'))];
                const s = getPublisherState(item.name);
                s.payload = item.payload;
                const publisher = publishers.find((candidate) => candidate.name === item.name);
                applyHistoryRequestToPublisher(publisher, item);
                saveAppState();
                await updateUIFromState();
                formatResponseDetails(item.status, item.statusText, item.duration, item.responseData, {
                    headers: item.metadata || [],
                    method: item.requestMetadata?.http_method,
                    path: item.requestMetadata?.http_path,
                    query: item.requestMetadata?.http_query,
                    targetLabel: item.targetLabel,
                    url: item.url,
                });
            };
        });
    };
    
    pubList.onclick = (e) => {
        const btn = e.target.closest('.pub-item');
        if (btn) {
            setActiveItem(parseInt(btn.getAttribute('data-idx')));
            updateUIFromState();
        }
    };

    document.getElementById('pub-filter').oninput = (e) => {
        const val = e.target.value.toLowerCase();
        document.querySelectorAll('#pub-list .pub-item').forEach(btn => {
            const name = btn.querySelector('.item-name').textContent.toLowerCase();
            btn.style.display = name.includes(val) ? 'flex' : 'none';
        });
    };

    document.getElementById('pub-add').onclick = () => {
        const name = prompt("Publisher Name:");
        if (!name) return;
        if (config.publishers.some(p => p.name === name)) return alert("Publisher already exists");
        config.publishers.push({ name, endpoint: { null: null }, comment: '', view: {} });
        // Re-render the sidebar with the new publisher
        // Re-initialize publishers tab to refresh the list
        window.initPublishers(config, schema);
        setActiveItem(config.publishers.length - 1);
        updateUIFromState();
    };

    document.getElementById('pub-clone').onclick = () => {
        const current = config.publishers[currentIdx];
        const cloned = JSON.parse(JSON.stringify(current));
        cloned.name += '_copy';
        if (config.publishers.some(p => p.name === cloned.name)) return alert("Cloned publisher name already exists. Please choose a different name.");
        config.publishers.push(cloned);
        // Re-initialize publishers tab to refresh the list
        window.initPublishers(config, schema);
        setActiveItem(config.publishers.length - 1);
        updateUIFromState();
    };

    document.getElementById('pub-delete').onclick = () => {
        if (config.publishers.length <= 1) return alert("Cannot delete last publisher");
        if (!confirm("Delete this publisher?")) return;
        // Clear state for the deleted publisher
        delete appState[config.publishers[currentIdx].name];
        config.publishers.splice(currentIdx, 1);
        // Re-initialize publishers tab to refresh the list
        window.initPublishers(config, schema);
        setActiveItem(0);
        updateUIFromState();
    };

    document.getElementById('pub-save').onclick = () => window.saveConfig();
    document.getElementById('add-meta').onclick = () => addMetadataRow();
    document.getElementById('pub-url').oninput = updateStateFromUI;
    document.getElementById('pub-beautify').onclick = () => {
        try {
            payloadArea.value = JSON.stringify(JSON.parse(payloadArea.value), null, 2);
            updateStateFromUI();
        } catch (e) {
            alert("Invalid JSON");
        }
    };

    if (payloadArea) payloadArea.oninput = updateStateFromUI;

    // Sub-tab switching logic
        pubSubTabs.querySelectorAll('.content-tab').forEach(tab => {
        tab.onclick = () => {
            if (!tab.dataset.target) return;
            
            pubSubTabs.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('#pub-top-content-wrapper > .pane-top').forEach(p => p.style.display = 'none'); // Target children of the wrapper
            
            tab.classList.add('active');
            const targetPane = document.getElementById(tab.dataset.target);
            if (targetPane) {
                targetPane.style.display = 'flex'; // Use flex for pane-top
                targetPane.style.flexDirection = 'column';
            }
        };
    });

    // Sending logic
    document.getElementById('pub-send').onclick = async () => {
        updateStateFromUI();

        // Auto-save configuration before sending
        const saved = await window.saveConfig(true);
        if (!saved) return;

        const pub = publishers[currentIdx];
        const name = pub.name;
        const payload = payloadArea.value;
        const metaArr = getEndpointType(pub) === 'http'
            ? sortEntries(ensureHttpConfig(pub).custom_headers).map(([k, v]) => ({ k, v }))
            : [];
        const metadata = buildHttpRequestMetadata();
        const urlInput = document.getElementById('pub-url');
        const requestUrl = urlInput?.value.trim() || '';
        const requestBinding = getRequestBarBinding(getEndpointType(pub));

        responseDiv.textContent = 'Sending...'; // Use textContent for simple message
        document.getElementById('pub-response-container').style.display = 'flex';
        
        try {
            const startTime = Date.now();
            const res = await fetch('/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, payload, metadata })
            });
            const duration = Date.now() - startTime;
            const text = await res.text();
            
            let responseData = text;
            try {
                responseData = JSON.parse(text);
            } catch(e) { /* not JSON */ }

            formatResponseDetails(res.status, res.statusText, duration, responseData, {
                headers: metaArr,
                method: metadata.http_method,
                path: metadata.http_path,
                query: metadata.http_query,
                targetLabel: requestBinding?.label,
                url: requestUrl,
            });

            history.unshift({
                name, 
                payload, 
                metadata: [...metaArr],
                requestMetadata: { ...metadata },
                targetLabel: requestBinding?.label,
                url: requestUrl,
                responseData, 
                status: res.status, 
                statusText: res.statusText,
                duration,
                time: Date.now()
            });
            saveHistory();
            renderHistory();
        } catch (e) {
            responseDiv.textContent = `Error: ${e.message}`;
            document.getElementById('pub-response-status').innerHTML = `<span style="color:var(--accent-kafka)">Error</span>`;
        }
    };

    // Initialize Split.js for the publisher pane
    // This needs to be done after the pane-container is rendered and visible.
    // It's best to do it when the tab is actually shown.
    // For initial load, we'll do it here, but subsequent tab switches might need to re-init or ensure visibility.
    if (document.getElementById('tab-publishers').classList.contains('active') && !pubSplit) {
        pubSplit = Split(['#pub-top-content-wrapper', '#pub-response-container'], {
            direction: 'vertical',
            sizes: [60, 40],
            minSize: 100,
            gutterSize: 4,
            elementStyle: (dimension, size, gutterSize) => ({
                'flex-basis': `calc(${size}% - ${gutterSize}px)`,
            }),
            gutterStyle: (dimension, gutterSize) => ({
                'flex-basis': `${gutterSize}px`,
            }),
        });
    }

    // Initial Load
    // Check if publishers exist before trying to set active item or update UI
    if (publishers.length > 0) {
        setActiveItem(0);
        updateUIFromState();
        document.getElementById('ctab-payload').click();
    } else {
        // If no publishers, ensure the "No publishers configured" message is visible
        // and the main content area is empty or shows the message.
        // This is handled by the initial container.innerHTML check.
    }

    // Expose restorePublisherState for index.html to call when switching to this tab
    window._mqb_publishers_initialized = true; // Mark as initialized
    window.restorePublisherState = restorePublisherState;
}
window.initPublishers = initPublishers;
