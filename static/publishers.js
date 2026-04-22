function initPublishers(config, schema) {
    const container = document.getElementById('publishers-container');
    const publishers = config.publishers || [];
    const STORAGE_KEY = 'mqb_publisher_state';
    const HISTORY_KEY = 'mqb_publisher_history';
    
    let appState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

    const saveAppState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    const saveHistory = () => {
        history = history.slice(0, 1000); // Keep last 1000 entries
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    };

    const updateUrlHash = () => {
        const activeTabBtn = document.querySelector('button[data-bs-toggle="tab"].active');
        if (!activeTabBtn) return;
        const tabName = activeTabBtn.getAttribute('data-bs-target').replace('#tab-', '').replace('#', '');
        if (tabName !== 'publishers') return;
        const idx = typeof currentIdx !== 'undefined' ? currentIdx : 0;
        window.history.replaceState(null, null, `#${tabName}:${idx}`);
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
        });
    });

    const getHashState = () => {
        const hash = window.location.hash.substring(1);
        const [tab, idx] = hash.split(':');
        return { tab: tab || 'publishers', idx: parseInt(idx) || 0 };
    };

    const restoreFromHash = () => {
        const state = getHashState();
        if (state.tab) {
            const tabBtn = document.querySelector(`button[data-bs-target="#tab-${state.tab}"]`);
            if (tabBtn && !tabBtn.classList.contains('active')) tabBtn.click();
            
            if (state.tab === 'publishers' && publishers[state.idx]) {
                if (currentIdx !== state.idx) {
                    setActiveItem(state.idx);
                    if (window._mqb_active_tab === 'publishers') updateUIFromState();
                }
            }
        }
    };

    const getPublisherState = (name) => {
        if (!appState[name]) {
            appState[name] = { payload: '{\n  "hello": "world"\n}', metadata: [] };
        }
        return appState[name];
    };

    container.innerHTML = `
        <div class="row mb-4 align-items-start g-3">
            <div class="col-md-4">
                <div class="card shadow-sm">
                    <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                        <span class="small fw-bold text-uppercase text-muted">Publisher List</span>
                        <button class="btn btn-sm btn-link text-decoration-none" id="pub-add">+ New</button>
                    </div>
                    <div class="p-2 border-bottom">
                        <input type="text" class="form-control form-control-sm" id="pub-filter" placeholder="Filter publishers...">
                    </div>
                    <div class="list-group list-group-flush overflow-auto" id="pub-list" style="max-height: 400px;">
                        ${publishers.map((p, i) => `
                            <button class="list-group-item list-group-item-action py-2 px-3 pub-item" data-idx="${i}">
                                <span>${p.name}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>

            <div class="col-md-8">
                ${publishers.length === 0 ? '<div class="alert alert-info">No publishers configured. Click "+ New" to create one.</div>' : `
                <div class="d-flex flex-column">
                    <ul class="nav nav-tabs mb-3" id="pub-tabs" role="tablist">
                        <li class="nav-item" role="presentation"><button class="nav-link active py-1 px-3" data-bs-toggle="tab" data-bs-target="#tab-payload" type="button">Body</button></li>
                        <li class="nav-item" role="presentation"><button class="nav-link py-1 px-3" data-bs-toggle="tab" data-bs-target="#tab-meta" type="button">Metadata</button></li>
                        <li class="nav-item" role="presentation"><button class="nav-link py-1 px-3" data-bs-toggle="tab" data-bs-target="#tab-history" type="button">History</button></li>
                        <li class="nav-item" role="presentation"><button class="nav-link py-1 px-3" data-bs-toggle="tab" data-bs-target="#tab-pub-config" type="button">Definition</button></li>
                    </ul>
                    <div class="tab-content border rounded p-2 bg-light" style="min-height: 400px;">
                        <div class="tab-pane fade show active h-100" id="tab-payload">
                            <div class="d-flex flex-column h-100">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <button class="btn btn-sm btn-link p-0 text-decoration-none" id="pub-beautify">Beautify JSON</button>
                                    <button class="btn btn-primary btn-sm px-4 fw-bold" id="pub-send">SEND</button>
                                </div>
                                <textarea class="form-control font-monospace flex-grow-1" id="pub-payload" style="resize: none; border: none; outline: none; background: transparent; min-height: 350px;"></textarea>
                            </div>
                        </div>
                        <div class="tab-pane fade" id="tab-pub-config">
                            <div class="d-flex gap-2 mb-3">
                                <button class="btn btn-primary btn-sm" id="pub-save">Save Config</button>
                                <button class="btn btn-outline-secondary btn-sm" id="pub-clone">&#10697; Clone</button>
                                <button class="btn btn-outline-danger btn-sm" id="pub-delete">&times; Delete</button>
                            </div>
                            <div id="pub-config-form" class="p-2"></div>
                        </div>
                        <div class="tab-pane fade" id="tab-meta">
                            <div id="metadata-container" class="mb-3"></div>
                            <button class="btn btn-outline-secondary btn-sm" id="add-meta">+ Add Header</button>
                        </div>
                        <div class="tab-pane fade" id="tab-history"></div>
                    </div>
                    <div id="pub-response-container" class="mt-3" style="display:none">
                        <div class="card shadow-sm border-primary">
                            <div class="card-header bg-primary text-white py-1 d-flex justify-content-between align-items-center">
                                <span class="small fw-bold text-uppercase">Response Details</span>
                                <div id="pub-response-status" class="small"></div>
                            </div>
                            <div id="pub-response" class="card-body p-0"></div>
                        </div>
                    </div>
                </div>
                ` }
            </div>
        </div>
    `;

    const pubList = document.getElementById('pub-list');
    const payloadArea = document.getElementById('pub-payload');
    const metaContainer = document.getElementById('metadata-container');
    const responseDiv = document.getElementById('pub-response');
    let currentIdx = 0;

    const setActiveItem = (idx) => {
        currentIdx = idx;
        document.querySelectorAll('.pub-item').forEach((btn, i) => {
            btn.classList.toggle('active', i === idx);
        });
    };

    const updateUIFromState = async () => {
        if (publishers.length === 0) return;
        const idx = currentIdx;
        updateUrlHash();

        // Clear previous response when switching publishers
        const responseContainer = document.getElementById('pub-response-container');
        if (responseContainer) responseContainer.style.display = 'none';

        const pub = publishers[idx];
        const s = getPublisherState(pub.name);
        if (payloadArea) payloadArea.value = s.payload;
        if (metaContainer) {
            metaContainer.innerHTML = '';
            s.metadata.forEach(m => addMetadataRow(m.k, m.v));
        }
        renderHistory();
        
        // Init Config Form
        const configFormContainer = document.getElementById('pub-config-form');
        if (!configFormContainer) return;
        configFormContainer.innerHTML = '';
        const itemSchema = JSON.parse(JSON.stringify({ 
            ...schema.properties.publishers.items, 
            $defs: schema.$defs 
        }));
        await window.VanillaSchemaForms.init(configFormContainer, itemSchema, publishers[idx], (updated) => {
            publishers[idx] = updated;
            const label = document.querySelector(`.pub-item[data-idx="${idx}"] span`);
            if (label) label.textContent = updated.name;
        });
    };

    const updateStateFromUI = () => {
        if (publishers.length === 0) return;
        const pub = publishers[currentIdx];
        const s = getPublisherState(pub.name);
        if (payloadArea) s.payload = payloadArea.value;
        s.metadata = [];
        if (metaContainer) metaContainer.querySelectorAll('.input-group').forEach(row => {
            const k = row.querySelector('.meta-key').value.trim();
            const v = row.querySelector('.meta-val').value.trim();
            if (k) s.metadata.push({ k, v });
        });
        saveAppState();
    };

    const addMetadataRow = (k = '', v = '') => {
        const row = document.createElement('div');
        row.className = 'input-group mb-2';
        row.innerHTML = `
            <input type="text" class="form-control form-control-sm meta-key" placeholder="Key" value="${k}">
            <input type="text" class="form-control form-control-sm meta-val" placeholder="Value" value="${v}">
            <button class="btn btn-outline-danger btn-sm remove-meta">X</button>`;
        metaContainer.appendChild(row);
        row.querySelector('.remove-meta').onclick = () => {
            row.remove();
            updateStateFromUI();
        };
        row.querySelectorAll('input').forEach(i => i.oninput = updateStateFromUI);
    };
    const formatResponseDetails = (
      container,
      status,
      statusText,
      duration,
      data,
    ) => {
      const badgeClass = status < 300 ? "bg-success" : "bg-danger";
      const statusTarget = document.getElementById("pub-response-status");
      if (statusTarget) {
        statusTarget.innerHTML = `<span class="badge ${badgeClass}">${status} ${statusText}</span> <span class="text-white-50 ms-2" style="font-size: 0.7rem">(${duration}ms)</span>`;
      }

      let metaHtml = "";
      let payload = "";

      if (data && typeof data === "object") {
          const isResponse = data.status === "Response" || (data.metadata && data.payload);
          
          if (isResponse && data.metadata && Object.keys(data.metadata).length > 0) {
              metaHtml = `
                  <div class="p-2 border-bottom">
                      <div class="small fw-bold text-muted text-uppercase mb-1" style="font-size: 10px">Metadata</div>
                      <table class="table table-sm table-bordered mb-0 small font-monospace">
                          <tbody>
                              ${Object.entries(data.metadata).map(([k, v]) => `
                                  <tr><td class="bg-light fw-bold" style="width: 30%">${k}</td><td>${v}</td></tr>
                              `).join('')}
                          </tbody>
                      </table>
                  </div>`;
          }
          
          payload = isResponse ? (data.payload || "") : 
                    (data.status === "Ack" ? "ACKNOWLEDGED: The backend processed the message successfully." : 
                    JSON.stringify(data, null, 2));
      } else {
          payload = String(data || "");
      }

      container.innerHTML = `${metaHtml}<div class="p-2">
          <div class="small fw-bold text-muted text-uppercase mb-1" style="font-size: 10px">Payload</div>
          <pre class="mb-0 small font-monospace bg-light p-2 border rounded payload-area" style="max-height: 400px; overflow: auto; white-space: pre-wrap;"></pre>
      </div>`;
      container.querySelector(".payload-area").textContent = payload;
      const responseContainer = document.getElementById("pub-response-container");
      if (responseContainer) responseContainer.style.display = "block";
    };

    const renderHistory = () => {
        const historyContainer = document.getElementById('tab-history');
        if (!historyContainer) return;
        const name = publishers[currentIdx]?.name;
        const filteredHistory = history.filter(item => item.name === name);

        historyContainer.innerHTML = `
            <div class="card shadow-sm border-0">
                <div class="card-header d-flex justify-content-between align-items-center bg-white py-1">
                    <span class="small fw-bold text-uppercase text-muted">Execution History: ${name}</span>
                    <button class="btn btn-sm btn-link text-danger p-0 text-decoration-none" id="pub-clear-history" style="font-size: 0.7rem">clear</button>
                </div>
                <div class="table-responsive" style="max-height: 400px;">
                    <table class="table table-hover table-sm mb-0">
                        <thead class="table-light sticky-top">
                            <tr>
                                <th style="width: 100px;">Time</th>
                                <th style="width: 80px;">Status</th>
                                <th>Payload Preview</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredHistory.length === 0 ? 
                                '<tr><td colspan="3" class="text-center text-muted py-4 small">No history for this publisher.</td></tr>' : 
                                filteredHistory.map((item) => {
                                    const statusClass = item.status < 300 ? 'text-success' : 'text-danger';
                                    const time = new Date(item.time).toLocaleTimeString();
                                    const payload = item.payload.substring(0, 100).replace(/\n/g, ' ');
                                    return `<tr class="history-row" data-hidx="${history.indexOf(item)}" style="cursor: zoom-in;">
                                        <td class="text-muted small">${time}</td>
                                        <td><span class="${statusClass} small fw-bold">${item.status}</span></td>
                                        <td class="font-monospace small text-break text-truncate" style="max-width: 300px;">${payload}</td>
                                    </tr>`;
                                }).join('')
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('pub-clear-history').onclick = () => {
            history = history.filter(item => item.name !== name);
            saveHistory();
            renderHistory();
            document.getElementById('pub-response-container').style.display = 'none';
        };

        historyContainer.querySelectorAll('.history-row').forEach(row => {
            row.onclick = () => {
                const item = history[parseInt(row.getAttribute('data-hidx'))];
                const s = getPublisherState(item.name);
                s.payload = item.payload;
                s.metadata = item.metadata || [];
                saveAppState();
                updateUIFromState();
                formatResponseDetails(responseDiv, item.status, item.statusText, item.duration, item.responseData);
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
        document.querySelectorAll('.pub-item').forEach(btn => {
            const name = btn.querySelector('span').textContent.toLowerCase();
            btn.style.display = name.includes(val) ? 'flex' : 'none';
        });
    };

    document.getElementById('pub-add').onclick = () => {
        const name = prompt("Publisher Name:");
        if (!name) return;
        if (config.publishers.some(p => p.name === name)) return alert("Publisher already exists");
        config.publishers.push({ name, endpoint: { null: null }, comment: '', view: {} });
        initPublishers(config, schema);
        setActiveItem(config.publishers.length - 1);
        updateUIFromState();
    };

    document.getElementById('pub-clone').onclick = () => {
        const current = config.publishers[currentIdx];
        const cloned = JSON.parse(JSON.stringify(current));
        cloned.name += '_copy';
        config.publishers.push(cloned);
        initPublishers(config, schema);
        setActiveItem(config.publishers.length - 1);
        updateUIFromState();
    };

    document.getElementById('pub-delete').onclick = () => {
        if (config.publishers.length <= 1) return alert("Cannot delete last publisher");
        if (!confirm("Delete this publisher?")) return;
        config.publishers.splice(currentIdx, 1);
        initPublishers(config, schema);
        setActiveItem(0);
        updateUIFromState();
    };

    document.getElementById('pub-save').onclick = () => window.saveConfig();
    document.getElementById('add-meta').onclick = () => addMetadataRow();
    document.getElementById('pub-beautify').onclick = () => {
        try {
            payloadArea.value = JSON.stringify(JSON.parse(payloadArea.value), null, 2);
            updateStateFromUI();
        } catch (e) {
            alert("Invalid JSON");
        }
    };

    payloadArea.oninput = updateStateFromUI;

    // Sending logic
    document.getElementById('pub-send').onclick = async () => {
        // Auto-save configuration before sending
        const saved = await window.saveConfig(true);
        if (!saved) return;

        const pub = publishers[currentIdx];
        const name = pub.name;
        const payload = payloadArea.value;
        const metadata = {};
        const metaArr = getPublisherState(pub.name).metadata;
        metaArr.forEach(m => metadata[m.k] = m.v);

        responseDiv.innerHTML = '<span class="text-muted">Sending...</span>';
        
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
            } catch(e) { }

            formatResponseDetails(responseDiv, res.status, res.statusText, duration, responseData);

            history.unshift({
                name, 
                payload, 
                metadata: [...metaArr], 
                responseData, 
                status: res.status, 
                statusText: res.statusText,
                duration,
                time: Date.now()
            });
            saveHistory();
            renderHistory();
        } catch (e) {
            responseDiv.innerHTML = `<div class="text-danger"><strong>Error:</strong> ${e.message}</div>`;
        }
    };

    window.addEventListener('hashchange', restoreFromHash);

    // Initial Load
    setActiveItem(0);
    updateUIFromState();
    setTimeout(restoreFromHash, 100);
}
window.initPublishers = initPublishers;