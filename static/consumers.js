async function initConsumers(config, schema) {
    const container = document.getElementById('consumers-container');
    const consumers = config.consumers || [];
    const MSG_STORAGE_KEY = 'mqb_consumer_messages';

    const updateUrlHash = () => {
        const activeTabBtn = document.querySelector('button[data-bs-toggle="tab"].active');
        if (!activeTabBtn) return;
        const tabName = activeTabBtn.getAttribute('data-bs-target').replace('#tab-', '').replace('#', '');
        // Only update index if we are on the consumers tab
        if (tabName !== 'consumers') return;
        const idx = typeof currentIdx !== 'undefined' ? currentIdx : 0;
        window.history.replaceState(null, null, `#${tabName}:${idx}`);
    };

    const getHashState = () => {
        const hash = window.location.hash.substring(1);
        const [tab, idx] = hash.split(':');
        return { tab: tab || 'publishers', idx: parseInt(idx) || 0 };
    };

    // Save the active main tab (Publishers/Consumers/Routes)
    document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(tabEl => {
        tabEl.addEventListener('shown.bs.tab', (e) => {
            const target = e.target.getAttribute('data-bs-target') || '';
            const tabName = target.replace('#tab-', '').replace('#', '');
            // Only track top-level navigation tabs
            if (['publishers', 'consumers', 'routes'].includes(tabName)) {
                window._mqb_active_tab = tabName;
            }
            updateUrlHash();
            if (window._mqb_active_tab === 'consumers') startPolling();
        });
    });

    const restoreFromHash = () => {
        const state = getHashState();
        if (state.tab) {
            const tabBtn = document.querySelector(`button[data-bs-target="#tab-${state.tab}"]`);
            if (tabBtn && !tabBtn.classList.contains('active')) tabBtn.click();
            
            if (state.tab === 'consumers' && consumers[state.idx]) {
                if (currentIdx !== state.idx) {
                    setActiveItem(state.idx);
                    if (window._mqb_active_tab === 'consumers') updateUI();
                }
            }
        }
    };

    // Load existing messages from LocalStorage
    let consumerMessages = JSON.parse(localStorage.getItem(MSG_STORAGE_KEY) || '{}');
    const saveMessages = () => localStorage.setItem(MSG_STORAGE_KEY, JSON.stringify(consumerMessages));

    let consumerStatus = {}; 

    const fetchConsumerStatus = async (name) => {
        try {
            const res = await fetch(`/consumer-status?consumer=${encodeURIComponent(name)}`);
            if (res.ok) {
                const data = await res.json();
                consumerStatus[name] = data;
                renderLiveLog();
                updateConsumerList();
            }
        } catch (e) { console.error("Error fetching status:", e); }
    };

    const toggleConsumer = async (name) => {
        const isRunning = consumerStatus[name]?.running;
        const action = isRunning ? 'stop' : 'start';
        try {
            const btn = document.getElementById('cons-toggle');
            if (btn) { btn.disabled = true; btn.textContent = '...'; }
            const res = await fetch(`/consumer-${action}?consumer=${encodeURIComponent(name)}`, { method: 'POST' });
            if (res.ok) {
                await fetchConsumerStatus(name);
            }
        } catch (e) { 
            console.error(`Error during ${action}:`, e);
            alert(`Failed to ${action} consumer`);
        }
    };

    const extractUuidV7Timestamp = (idStr) => {
        try {
            // UUIDv7 hex: 018f3a3a-3a3a-... (First 48 bits / 12 hex chars are timestamp in ms)
            const hex = idStr.replace(/-/g, '');
            const ms = parseInt(hex.substring(0, 12), 16);
            return new Date(ms).toLocaleString();
        } catch (e) { return null; }
    };

    container.innerHTML = `
        <div class="row mb-4 align-items-start g-3">
            <div class="col-md-4">
                <div class="card shadow-sm">
                    <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                        <span class="small fw-bold text-uppercase text-muted">Consumer List</span>
                        <button class="btn btn-sm btn-link text-decoration-none" id="cons-add">+ New</button>
                    </div>
                    <div class="p-2 border-bottom">
                        <input type="text" class="form-control form-control-sm" id="cons-filter" placeholder="Filter consumers...">
                    </div>
                    <div class="list-group list-group-flush overflow-auto" id="cons-list" style="max-height: 400px;">
                        ${consumers.map((c, i) => `
                            <button class="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center cons-item" data-idx="${i}">
                                <div class="d-flex align-items-center"><small class="me-2 cons-indicator" style="font-size: 8px">○</small><span>${c.name}</span></div>
                                <span class="badge rounded-pill bg-light text-dark border">${consumerMessages[c.name]?.length || 0}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="col-md-8">
                ${consumers.length === 0 ? '<div class="alert alert-info">No consumers configured. Click "+ New" to create one.</div>' : `
                <ul class="nav nav-tabs mb-3" id="cons-tabs" role="tablist">
                    <li class="nav-item"><button class="nav-link active py-1 px-3" data-bs-toggle="tab" data-bs-target="#tab-cons-live" type="button">Live Messages</button></li>
                    <li class="nav-item"><button class="nav-link py-1 px-3" data-bs-toggle="tab" data-bs-target="#tab-cons-config" type="button">Definition</button></li>
                </ul>
                <div class="tab-content">
                    <div class="tab-pane fade show active" id="tab-cons-live">
                        <div id="cons-live-content"></div>
                        <div id="cons-msg-details" class="mt-3" style="display:none">
                            <div class="card shadow-sm border-primary">
                                <div class="card-header bg-primary text-white py-1 d-flex justify-content-between align-items-center">
                                    <span class="small fw-bold text-uppercase">Message Details</span>
                                    <button type="button" class="btn-close btn-close-white" style="font-size: 0.6rem" onclick="document.getElementById('cons-msg-details').style.display='none'"></button>
                                </div>
                                <div class="card-body p-0">
                                    <pre class="mb-0 p-2 small font-monospace bg-light" id="cons-msg-details-content" style="max-height: 400px; overflow: auto; white-space: pre-wrap;"></pre>
                                </div>
                            </div>
                        </div>
                    </div>
            <div class="tab-pane fade" id="tab-cons-config">
                        <div class="d-flex gap-2 mb-3">
                            <button class="btn btn-primary btn-sm" id="cons-save">Save Config</button>
                            <button class="btn btn-outline-secondary btn-sm" id="cons-clone" title="Clone Current">&#10697; Clone</button>
                            <button class="btn btn-outline-danger btn-sm" id="cons-delete" title="Delete">&times; Delete</button>
                        </div>
                <div id="cons-config-form" class="p-3 border rounded bg-light"></div>
            </div>
                </div>`}
            </div>
        </div>
    `;

    const consList = document.getElementById('cons-list');
    const liveContent = document.getElementById('cons-live-content');
    let currentIdx = 0;

    const updateConsumerList = () => {
        document.querySelectorAll('.cons-item').forEach(btn => {
            const name = btn.querySelector('span').textContent;
            const status = consumerStatus[name];
            const indicator = btn.querySelector('.cons-indicator');
            if (indicator && status) {
                indicator.textContent = status.running ? '●' : '○';
                indicator.className = 'me-2 cons-indicator ' + (status.running 
                    ? (status.status?.healthy ? 'text-success' : 'text-danger') 
                    : 'text-muted');
            }
        });
    };

    const setActiveItem = (idx) => {
        currentIdx = idx;
        document.querySelectorAll('.cons-item').forEach((btn, i) => {
            btn.classList.toggle('active', i === idx);
        });
    };

    window.showMsgDetails = (name, msgIdx) => {
        const msg = (consumerMessages[name] || [])[msgIdx];
        if (!msg) return;
        const container = document.getElementById("cons-msg-details");
        const cardBody = container.querySelector(".card-body");
        
        let metaHtml = "";
        if (msg.metadata && Object.keys(msg.metadata).length > 0) {
            metaHtml = `
                <div class="p-2 border-bottom">
                    <div class="small fw-bold text-muted text-uppercase mb-1" style="font-size: 10px">Metadata</div>
                    <table class="table table-sm table-bordered mb-0 small font-monospace">
                        <tbody>
                            ${Object.entries(msg.metadata).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `
                                <tr><td class="bg-light fw-bold" style="width: 30%">${k}</td><td>${v}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        cardBody.innerHTML = `
            ${metaHtml}
            <div class="p-2">
                <div class="small fw-bold text-muted text-uppercase mb-1" style="font-size: 10px">Payload</div>
                <pre class="mb-0 small font-monospace bg-light p-2 border rounded" id="cons-msg-details-content" style="max-height: 600px; overflow: auto; white-space: pre-wrap;"></pre>
            </div>
        `;

        const content = document.getElementById("cons-msg-details-content");
        let payload = msg.payload;
        if (typeof payload !== 'string') {
            payload = JSON.stringify(payload, null, 2);
        }
        content.textContent = payload;

        container.style.display = "block";
        container.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    
    if (consumers.length === 0) {
        document.getElementById('cons-add').onclick = () => {
            const name = prompt("Consumer Name:");
            if (!name) return;
            config.consumers = [{ name, endpoint: { null: null }, comment: '', view: {} }];
            initConsumers(config, schema);
        };
        return;
    }
    
    const updateUI = async () => {
        const idx = currentIdx;
        updateUrlHash();
        const configFormContainer = document.getElementById('cons-config-form');
        configFormContainer.innerHTML = '';
        const itemSchema = JSON.parse(JSON.stringify({ 
            ...schema.properties.consumers.items, 
            $defs: schema.$defs 
        }));
        if (consumers[idx]) fetchConsumerStatus(consumers[idx].name);
        await window.VanillaSchemaForms.init(configFormContainer, itemSchema, config.consumers[idx], (updated) => {
            config.consumers[idx] = updated;
            const label = document.querySelector(`.cons-item[data-idx="${idx}"] span`);
            if (label) label.textContent = updated.name;
        });
        renderLiveLog();
    };

    const renderLiveLog = () => {
        const name = consumers[currentIdx].name;
        const messages = consumerMessages[name] || [];
        const status = consumerStatus[name] || { running: false, status: { healthy: false } };

        const statusHtml = status.running 
            ? (status.status.healthy ? '<span class="text-success small fw-bold">● Connected</span>' : `<span class="text-danger small fw-bold" title="${status.status.error || ''}">● Connection Error</span>`)
            : '<span class="text-muted small fw-bold">○ Log Collector Stopped</span>';
        
        const btnText = status.running ? 'Stop' : 'Start';
        const btnClass = status.running ? 'btn-outline-danger' : 'btn-outline-success';

        liveContent.innerHTML = `
            <div class="card shadow-sm">
                <div class="card-header d-flex justify-content-between align-items-center bg-white">
                    <div>
                        <span class="fw-bold me-2">Incoming Messages: <span class="text-primary">${name}</span></span>
                        <button class="btn btn-sm btn-link text-danger p-0" id="cons-clear-history">clear</button>
                    </div>
                    <div class="d-flex align-items-center gap-3">
                        ${statusHtml}
                        <button class="btn btn-sm ${btnClass} px-3 fw-bold" id="cons-toggle">${btnText}</button>
                    </div>
                </div>
                <div class="table-responsive" style="max-height: 400px;">
                    <table class="table table-hover table-sm mb-0">
                        <thead class="table-light sticky-top">
                            <tr><th style="width: 120px;">Time</th><th>Payload Preview</th></tr>
                        </thead>
                        <tbody id="consumer-log-body">
                            ${messages.length === 0 ? 
                                '<tr><td colspan="2" class="text-center text-muted py-4 small">Waiting for incoming messages...</td></tr>' : 
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
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('cons-clear-history').onclick = () => {
            consumerMessages[name] = [];
            saveMessages();
            renderLiveLog();
        };
        document.getElementById('cons-toggle').onclick = () => toggleConsumer(name);
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
        document.querySelectorAll('.cons-item').forEach(btn => {
            const name = btn.querySelector('span').textContent.toLowerCase();
            btn.style.display = name.includes(val) ? 'flex' : 'none';
        });
    };

    document.getElementById('cons-add').onclick = () => {
        const name = prompt("Consumer Name:");
        if (!name) return;
        if (config.consumers.some(c => c.name === name)) return alert("Consumer already exists");
        config.consumers.push({ name, endpoint: { null: null }, comment: '', view: {} });
        initConsumers(config, schema);
        setActiveItem(config.consumers.length - 1);
        updateUI();
    };

    document.getElementById('cons-clone').onclick = () => {
        const current = config.consumers[currentIdx];
        const cloned = JSON.parse(JSON.stringify(current));
        cloned.name += '_copy';
        config.consumers.push(cloned);
        initConsumers(config, schema);
    };

    document.getElementById('cons-delete').onclick = () => {
        if (config.consumers.length <= 1) return alert("Cannot delete last consumer");
        if (!confirm("Delete this consumer?")) return;
        config.consumers.splice(currentIdx, 1);
        initConsumers(config, schema);
    };

    document.getElementById('cons-save').onclick = () => window.saveConfig();

    const startPolling = () => {
        if (window._mqb_polling_active) return;
        window._mqb_polling_active = true;

        const poll = async () => {
            // Only poll if the Consumers tab is active to save resources
            if (window._mqb_active_tab !== 'consumers') {
                window._mqb_polling_active = false;
                return;
            }

            try {
                // Use the latest consumer list from the config object
                const currentConsumers = config.consumers || [];
                const name = currentConsumers[currentIdx]?.name;
                if (!name) return setTimeout(poll, 1000);

                if (!consumerStatus[name]?.running) {
                    await fetchConsumerStatus(name);
                    return setTimeout(poll, 2000);
                }

                const res = await fetch(`/messages?consumer=${encodeURIComponent(name)}`);
                if (res.ok) {
                    const data = await res.json();
                    let hasNew = false;
                    for (const [name, msgs] of Object.entries(data)) {
                        if (!consumerMessages[name]) consumerMessages[name] = [];
                        // Prepend new messages and keep last 50
                        consumerMessages[name] = [...msgs, ...consumerMessages[name]].slice(0, 1000);
                        hasNew = true;
                    }
                    if (hasNew) {
                        saveMessages();
                        if (data[name]) renderLiveLog();
                        // Update badges in the list
                        document.querySelectorAll('.cons-item').forEach(btn => {
                            const cName = btn.querySelector('span').textContent;
                            const badge = btn.querySelector('.badge');
                            if (badge) badge.textContent = consumerMessages[cName]?.length || 0;
                        });
                    }
                }
            } catch (e) {
                console.error("Polling error:", e);
            }
            // Enforce a 1s cooldown between requests to avoid worker starvation
            setTimeout(poll, 1000);
        };
        poll();
    };

    window.addEventListener('hashchange', restoreFromHash);
    const initialTab = document.querySelector('button[data-bs-toggle="tab"].active');
    if (initialTab) {
        const target = initialTab.getAttribute('data-bs-target') || '';
        const tabName = target.replace('#tab-', '').replace('#', '');
        // Only initialize state for main navigation tabs
        if (['publishers', 'consumers', 'routes'].includes(tabName)) {
            window._mqb_active_tab = tabName;
        }
    }
    setActiveItem(0);
    updateUI();
    startPolling();
    setTimeout(restoreFromHash, 100); // Small delay to ensure all scripts are ready
}
window.initConsumers = initConsumers;