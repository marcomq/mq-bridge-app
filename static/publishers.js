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

    const REQUEST_BAR_LAYOUTS = {
        http: {
            showMethod: true,
            fields: [
                { inputId: 'pub-url', field: 'url', label: 'URL', placeholder: 'https://example.com/api' },
            ],
        },
        kafka: {
            fields: [
                { inputId: 'pub-extra-1', field: 'topic', label: 'TOPIC', placeholder: 'events' },
                { inputId: 'pub-url', field: 'url', label: 'BROKERS', placeholder: 'kafka:9092' },
            ],
        },
        mqtt: {
            fields: [
                { inputId: 'pub-extra-1', field: 'topic', label: 'TOPIC', placeholder: 'events/updates' },
                { inputId: 'pub-url', field: 'url', label: 'BROKER', placeholder: 'tcp://localhost:1883' },
            ],
        },
        grpc: {
            fields: [
                { inputId: 'pub-url', field: 'url', label: 'URL', placeholder: 'http://localhost:50051' },
            ],
        },
        amqp: {
            fields: [
                { inputId: 'pub-extra-1', field: 'queue', label: 'QUEUE', placeholder: 'jobs' },
                { inputId: 'pub-url', field: 'url', label: 'URL', placeholder: 'amqp://guest:guest@localhost:5672/%2f' },
            ],
        },
        ibmmq: {
            fields: [
                { inputId: 'pub-extra-1', field: 'queue', label: 'QUEUE', placeholder: 'DEV.QUEUE.1' },
                { inputId: 'pub-extra-2', field: 'topic', label: 'TOPIC', placeholder: 'topic://events' },
                { inputId: 'pub-url', field: 'url', label: 'HOST', placeholder: 'mq-host(1414)' },
            ],
        },
        nats: {
            fields: [
                { inputId: 'pub-extra-1', field: 'subject', label: 'SUBJECT', placeholder: 'events.created' },
                { inputId: 'pub-url', field: 'url', label: 'SERVERS', placeholder: 'nats://localhost:4222' },
            ],
        },
        mongodb: {
            fields: [
                { inputId: 'pub-extra-1', field: 'database', label: 'DATABASE', placeholder: 'app' },
                { inputId: 'pub-extra-2', field: 'collection', label: 'COLLECTION', placeholder: 'messages' },
                { inputId: 'pub-url', field: 'url', label: 'URL', placeholder: 'mongodb://localhost:27017' },
            ],
        },
        zeromq: {
            fields: [
                { inputId: 'pub-extra-1', field: 'topic', label: 'TOPIC', placeholder: 'events' },
                { inputId: 'pub-url', field: 'url', label: 'URL', placeholder: 'tcp://127.0.0.1:5555' },
            ],
        },
        file: {
            fields: [
                { inputId: 'pub-url', field: 'path', label: 'PATH', placeholder: '/tmp/messages.jsonl' },
            ],
        },
        memory: {
            fields: [
                { inputId: 'pub-url', field: 'topic', label: 'TOPIC', placeholder: 'events' },
            ],
        },
        sled: {
            fields: [
                { inputId: 'pub-extra-1', field: 'tree', label: 'TREE', placeholder: 'default' },
                { inputId: 'pub-url', field: 'path', label: 'PATH', placeholder: './data/sled' },
            ],
        },
    };

    const SCHEMA_REQUEST_BAR_FIELDS = {
        HttpConfig: ['url', 'custom_headers'],
        KafkaConfig: ['url', 'topic'],
        MqttConfig: ['url', 'topic'],
        GrpcConfig: ['url'],
        AmqpConfig: ['url', 'queue'],
        IbmMqConfig: ['url', 'queue', 'topic'],
        NatsConfig: ['url', 'subject'],
        MongoDbConfig: ['url', 'database', 'collection'],
        ZeroMqConfig: ['url', 'topic'],
        FileConfig: ['path'],
        MemoryConfig: ['topic'],
        SledConfig: ['path', 'tree'],
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

    const getRequestBarLayout = (endpointType) => REQUEST_BAR_LAYOUTS[endpointType] || { fields: [] };

    const getRequestBarFieldValue = (publisher, descriptor) => {
        if (!descriptor) return '';
        const endpointType = getEndpointType(publisher);
        const endpointConfig = ensureEndpointConfig(publisher, endpointType);
        return typeof endpointConfig?.[descriptor.field] === 'string' ? endpointConfig[descriptor.field] : '';
    };

    const setRequestBarFieldValue = (publisher, descriptor, rawValue) => {
        if (!descriptor) return;
        const endpointType = getEndpointType(publisher);
        const endpointConfig = ensureEndpointConfig(publisher, endpointType);
        endpointConfig[descriptor.field] = rawValue;
    };

    const getPublishStatusInfo = (endpointType, response, responseData) => {
        if (!response.ok) {
            return {
                ok: false,
                code: response.status,
                label: String(response.status),
                text: response.statusText || 'Error',
            };
        }

        if (endpointType === 'http') {
            return {
                ok: true,
                code: response.status,
                label: String(response.status),
                text: response.statusText || 'OK',
            };
        }

        if (responseData && typeof responseData === 'object') {
            if (responseData.status === 'Ack') {
                return {
                    ok: true,
                    code: response.status,
                    label: 'ACK',
                    text: `${endpointType.toUpperCase()} accepted`,
                };
            }

            if (responseData.status === 'Response') {
                return {
                    ok: true,
                    code: response.status,
                    label: 'RESP',
                    text: `${endpointType.toUpperCase()} replied`,
                };
            }
        }

        return {
            ok: true,
            code: response.status,
            label: 'OK',
            text: `${endpointType.toUpperCase()} sent`,
        };
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

        methodSelect.innerHTML = `<option>TARGET</option>`;
        methodSelect.value = 'TARGET';
        methodSelect.disabled = true;
        methodSelect.title = `Quick access fields for the ${endpointType.toUpperCase()} publisher configuration are shown next to the endpoint type.`;
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
        const endpointType = getEndpointType(pub);
        const layout = getRequestBarLayout(endpointType);

        if (protocolSelect) {
            const protocolValue = endpointType === 'ibmmq' ? 'MQ' : endpointType.toUpperCase();
            protocolSelect.value = protocolValue;
            protocolSelect.disabled = true;
        }

        const methodWrap = document.getElementById('pub-method-wrap');
        if (methodWrap) {
            methodWrap.hidden = !layout.showMethod;
        }
        setMethodSelectMode(methodSelect, endpointType);

        ['pub-extra-1', 'pub-extra-2', 'pub-url'].forEach((inputId) => {
            const input = document.getElementById(inputId);
            const wrap = document.getElementById(`${inputId}-wrap`);
            const label = document.getElementById(`${inputId}-label`);
            const descriptor = layout.fields.find((field) => field.inputId === inputId);

            if (!input || !wrap || !label) return;

            if (!descriptor) {
                wrap.hidden = true;
                input.value = '';
                input.disabled = true;
                input.placeholder = '';
                input.title = '';
                return;
            }

            wrap.hidden = false;
            label.textContent = descriptor.label;
            input.disabled = false;
            input.value = getRequestBarFieldValue(pub, descriptor);
            input.placeholder = descriptor.placeholder || '';
            input.title = `${descriptor.label} for this ${endpointType.toUpperCase()} publisher`;
        });
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
            publishers.map((p, i) => {
                const type = getEndpointType(p).toUpperCase();
                return `
                <div class="sidebar-item pub-item" data-idx="${i}">
                    <span class="proto-badge proto-${type.toLowerCase()}">${type}</span>
                    <span class="item-name">${p.name}</span>
                    <span class="item-status status-off"></span>
                </div>
            `;
            }).join('');

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
        const endpointType = getEndpointType(pub);
        const layout = getRequestBarLayout(endpointType);
        layout.fields.forEach((descriptor) => {
            const input = document.getElementById(descriptor.inputId);
            setRequestBarFieldValue(pub, descriptor, input?.value.trim() || '');
        });

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

    const formatResponseDetails = (statusInfo, duration, data, requestInfo = {}) => {
        const statusTarget = document.getElementById("pub-response-status"); // Removed responseContainer from here
        const responseBody = document.getElementById("pub-response");
        const responseContainer = document.getElementById("pub-response-container");
        const copyBtn = document.getElementById("pub-resp-copy");

        if (!statusTarget || !responseBody || !responseContainer) return;

        const statusColor = statusInfo?.ok ? "var(--accent-http)" : "var(--accent-kafka)";
        const statusLabel = statusInfo?.label || 'OK';
        const statusText = statusInfo?.text || '';
        
        // Calculate approximate size
        const payloadStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        const size = new TextEncoder().encode(payloadStr).length;
        const sizeStr = size > 1024 ? (size/1024).toFixed(2) + ' KB' : size + ' B';

        statusTarget.innerHTML = `
            <span style="color:${statusColor}; font-weight: bold; padding: 2px 4px; border-radius: 3px; background: rgba(0,0,0,0.2)">${statusLabel}${statusText ? ` ${statusText}` : ''}</span>
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
        payloadContainer.style.color = 'var(--text-payload)';

        if (copyBtn) copyBtn.onclick = () => navigator.clipboard.writeText(payloadContent);

        // Update response tab indicator to match concept
        const responseTab = document.getElementById("pub-response-tab");
        if (responseTab) {
            responseTab.style.display = 'flex';
            responseTab.style.color = statusColor;
            responseTab.textContent = `Response ✓ ${statusLabel}`;
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
                <wa-button variant="neutral" appearance="outlined" size="small" class="ghost-action" id="pub-clear-history">Clear</wa-button>
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
                                const isOk = typeof item.ok === 'boolean' ? item.ok : item.status < 300;
                                const statusClass = isOk ? 'status-ok' : 'status-err';
                                const time = new Date(item.time).toLocaleTimeString();
                                const payload = item.payload.substring(0, 100).replace(/\n/g, ' ');
                                return `<tr class="history-row" data-hidx="${history.indexOf(item)}" style="cursor: zoom-in;">
                                    <td class="ts">${time}</td>
                                    <td><span class="${statusClass} small fw-bold">${item.displayStatus || item.status}</span></td>
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
                formatResponseDetails({
                    ok: typeof item.ok === 'boolean' ? item.ok : item.status < 300,
                    code: item.status,
                    label: item.displayStatus || String(item.status),
                    text: item.displayStatusText || item.statusText,
                }, item.duration, item.responseData, {
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
        config.publishers.push({ name, endpoint: { null: null }, comment: '' });
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

    document.getElementById('pub-save').onclick = (e) => window.saveConfig(false, e.currentTarget);
    document.getElementById('add-meta').onclick = () => addMetadataRow();
    ['pub-url', 'pub-extra-1', 'pub-extra-2'].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.oninput = updateStateFromUI;
    });
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
        const layout = getRequestBarLayout(getEndpointType(pub));
        const requestBinding = layout.fields.find((field) => field.inputId === 'pub-url') || layout.fields[0] || null;

        responseDiv.textContent = 'Sending...'; // Use textContent for simple message
        document.getElementById('pub-response-container').style.display = 'flex';
        
        try {
            const startTime = Date.now();
            const endpointType = getEndpointType(pub);
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

            const statusInfo = getPublishStatusInfo(endpointType, res, responseData);

            formatResponseDetails(statusInfo, duration, responseData, {
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
                ok: statusInfo.ok,
                status: res.status, 
                statusText: res.statusText,
                displayStatus: statusInfo.label,
                displayStatusText: statusInfo.text,
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
