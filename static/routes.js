async function initRoutes(config, schema) {
    const lib = window.VanillaSchemaForms;
    const h = lib.h;
    const container = document.getElementById('routes-container');
    const ROUTE_VALIDATION_NOISE = [
        "Schema: must have required property 'name'",
        "Schema: must have required property 'endpoint'",
    ];
    const defaultMetricsMiddleware = () => [{ metrics: {} }];
    const isRouteEnabled = (route) => route?.enabled !== false;
    const hasMetricsMiddleware = (route) => {
        const hasMetrics = (endpoint) =>
            (endpoint?.middlewares || []).some((middleware) => Object.prototype.hasOwnProperty.call(middleware || {}, 'metrics'));
        return hasMetrics(route?.input) || hasMetrics(route?.output);
    };
    const formatThroughput = (value) => {
        if (!Number.isFinite(value) || value <= 0) return '0 msg/s';
        if (value >= 100) return `${Math.round(value)} msg/s`;
        if (value >= 10) return `${value.toFixed(1)} msg/s`;
        return `${value.toFixed(2)} msg/s`;
    };
    const applyEndpointSchemaDefaults = (routeSchema) => {
        const fileConfigSchema = routeSchema.$defs?.FileConfig;
        if (fileConfigSchema?.properties?.format) {
            fileConfigSchema.properties.format.default = 'raw';
        }

        const mongoDbConfigSchema = routeSchema.$defs?.MongoDbConfig;
        if (mongoDbConfigSchema?.properties?.format) {
            mongoDbConfigSchema.properties.format.default = 'raw';
        }

        if (routeSchema?.properties?.enabled) {
            delete routeSchema.properties.enabled;
        }

        if (routeSchema?.properties?.description) {
            delete routeSchema.properties.description;
        }

        if (Array.isArray(routeSchema?.required)) {
            routeSchema.required = routeSchema.required.filter((key) => key !== 'enabled' && key !== 'description');
        }
    };
    const scrubRouteValidationNoise = (root) => {
        if (!root) return;

        root.querySelectorAll('div, small, span').forEach((node) => {
            const text = node.textContent?.trim();
            if (!text || !ROUTE_VALIDATION_NOISE.some((msg) => text.includes(msg))) {
                return;
            }

            const removable = node.closest('[data-validation-for], #form-global-errors > *, .invalid-feedback, .js-validation-error');
            if (removable) {
                removable.remove();
                return;
            }

            node.remove();
        });
    };
    const watchRouteValidationNoise = (root) => {
        if (!root) return;
        if (root._routeValidationNoiseObserver) {
            root._routeValidationNoiseObserver.disconnect();
        }

        scrubRouteValidationNoise(root);
        const observer = new MutationObserver(() => scrubRouteValidationNoise(root));
        observer.observe(root, { childList: true, subtree: true, characterData: true });
        root._routeValidationNoiseObserver = observer;
    };
    // Convert routes object to an array of objects for easier iteration and access to properties
    const routesArray = Object.entries(config.routes || {}).map(([name, details]) => ({ name, ...details }));
    window.registerDirtySection('routes', {
        buttonId: 'route-save',
        getValue: () => config.routes,
    });
    const cloneJson = (value) => JSON.parse(JSON.stringify(value));
    const nextConsumerName = (baseName) => {
        const existingNames = new Set((config.consumers || []).map((consumer) => consumer.name));
        let candidate = baseName;
        let index = 1;
        while (existingNames.has(candidate)) {
            candidate = `${baseName}_${index}`;
            index += 1;
        }
        return candidate;
    };
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
        window.initRoutes(config, schema);
        if (window.restoreRouteState) {
            window.restoreRouteState(routeIdx);
        }
    };
    const openConsumerAt = (idx, tab = 'definition') => {
        window._mqb_pending_consumer_restore = { idx, tab };
        window.history.replaceState(null, null, `#consumers:${idx}`);
        if (window.switchMain) {
            window.switchMain('consumers');
            window.setTimeout(() => {
                window.restoreConsumerState?.(idx, { tab });
            }, 0);
            return;
        }
        window.initConsumers(config, window.appSchema);
        if (window.restoreConsumerState) {
            window.restoreConsumerState(idx, { tab });
        }
    };
    const openPublisherAt = (idx, tab = 'definition') => {
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
    const createRefInputEndpoint = (refName) => ({
        middlewares: defaultMetricsMiddleware(),
        ref: refName,
    });
    const getCurrentRouteEntry = () => routesArray[currentIdx] || null;

    const copyCurrentRoute = async () => {
        const current = getCurrentRouteEntry();
        if (!current) return;

        const choice = await window.mqbChoose(
            "Choose what to create from this route.",
            "Copy Route",
            {
                confirmLabel: 'Continue',
                choices: [
                    { value: 'input_consumer', label: 'Input -> New Consumer', description: 'Copies the current route input into a consumer.' },
                    { value: 'output_publisher', label: 'Output -> New Publisher', description: 'Copies the current route output into a publisher.' },
                    { value: 'output_ref', label: 'Output -> New Ref Route', description: 'Creates a new route with a ref input and this output.' },
                ],
            },
        );
        if (!choice) return;

        if (choice === 'input_consumer') {
            const consumerName = await window.mqbPrompt(
                'Choose a name for the new consumer.',
                'Copy Route Input',
                {
                    confirmLabel: 'Create',
                    value: nextConsumerName(`${current.name}_consumer`),
                    placeholder: 'route_consumer',
                },
            );
            if (!consumerName) return;
            if ((config.consumers || []).some((consumer) => consumer.name === consumerName)) {
                return window.mqbAlert("Consumer already exists");
            }

            config.consumers.push({
                name: consumerName,
                endpoint: cloneJson(current.input),
                comment: '',
                response: null,
            });
            window.refreshDirtySection('consumers');
            openConsumerAt(config.consumers.length - 1, 'definition');
            return;
        }

        if (choice === 'output_publisher') {
            const publisherName = await window.mqbPrompt(
                'Choose a name for the new publisher.',
                'Copy Route Output',
                {
                    confirmLabel: 'Create',
                    value: nextPublisherName(`${current.name}_publisher`),
                    placeholder: 'route_publisher',
                },
            );
            if (!publisherName) return;
            if ((config.publishers || []).some((publisher) => publisher.name === publisherName)) {
                return window.mqbAlert("Publisher already exists");
            }

            config.publishers.push({
                name: publisherName,
                endpoint: cloneJson(current.output),
                comment: '',
            });
            window.refreshDirtySection('publishers');
            openPublisherAt(config.publishers.length - 1, 'definition');
            return;
        }

        const refTarget = await window.mqbPrompt(
            'Choose the ref input name for the new route.',
            'Copy Route Output as Ref',
            {
                confirmLabel: 'Next',
                value: current.name,
                placeholder: 'route_ref',
            },
        );
        if (!refTarget) return;

        const routeName = await window.mqbPrompt(
                'Choose a name for the new route.',
                'Copy Route Output as Ref',
                {
                    confirmLabel: 'Create',
                    value: nextRouteName(`${current.name}_ref_route`),
                    placeholder: 'ref_route',
                },
            );
        if (!routeName) return;
        if (config.routes[routeName]) return window.mqbAlert("Route already exists");

        config.routes[routeName] = {
            enabled: true,
            input: createRefInputEndpoint(refTarget),
            output: cloneJson(current.output),
        };
        window.refreshDirtySection('routes');
        openRouteAt(routeName);
    };

    let currentIdx = 0; // Currently active route index

    // The container HTML is now defined in index.html.
    // We only need to populate dynamic parts and attach event listeners.
    container.style.display = 'contents'; // Ensure the container is visible

    const routeList = document.getElementById('route-list');
    const preserveToolbarClick = (buttonId) => {
        const button = document.getElementById(buttonId);
        if (!button) return null;
        button.onmousedown = (event) => {
            event.preventDefault();
        };
        return button;
    };
    const settleRouteSavedState = () => {
        window.setTimeout(() => {
            window.markSectionSaved('routes');
            const saveButton = document.getElementById('route-save');
            if (saveButton) {
                saveButton.dataset.dirty = 'false';
                window.syncSaveButtonLabel(saveButton);
            }
        }, 0);
    };
    const syncRoutesArrayFromConfig = (routesConfig) => {
        routesArray.splice(
            0,
            routesArray.length,
            ...Object.entries(routesConfig || {}).map(([name, details]) => ({ name, ...details })),
        );
    };
    const splitRouteFormData = (routeName, updated) => {
        const nextName = typeof updated?.name === 'string' ? updated.name.trim() : '';
        const routeData = { ...(updated || {}) };
        delete routeData.name;
        return {
            nextName: nextName || routeName,
            routeData,
        };
    };

    const createRouteSidebarItem = (route, index) => {
        const inputProto =
          Object.keys(route.input)
            .filter((key) => key !== "middlewares")[0]?.toUpperCase() || "N/A";
        const outputProto =
          Object.keys(route.output)
            .filter((key) => key !== "middlewares")[0]?.toUpperCase() || "N/A";
        const item = h(
            'div',
            {
                className: `sidebar-item route-item${isRouteEnabled(route) ? '' : ' is-disabled'}`,
                'data-idx': String(index),
            },
            h('span', { className: `proto-badge proto-${inputProto.toLowerCase()}` }, inputProto.substring(0, 4)),
            h('span', { className: 'item-name' }, route.name),
        );

        if (isRouteEnabled(route) && hasMetricsMiddleware(route)) {
            const throughput = h('span', { className: 'route-throughput', 'data-route-name': route.name }, '0 msg/s');
            item.appendChild(throughput);
        }

        if (!isRouteEnabled(route)) {
            item.appendChild(h('span', { className: 'route-disabled-tag' }, 'OFF'));
        }

        const outputBadge = h('span', { className: `proto-badge proto-${outputProto.toLowerCase()}` }, outputProto.substring(0, 4));
        outputBadge.style.marginLeft = 'auto';
        item.appendChild(outputBadge);

        return item;
    };

    const renderSidebar = () => {
        if (!routeList) return;
        routeList.replaceChildren(
            h('div', { className: 'sidebar-group-label' }, 'Routes'),
            ...routesArray.map((route, index) => createRouteSidebarItem(route, index)),
        );

        const hasRoutes = routesArray.length > 0;
        document.getElementById('route-empty-alert').style.display = hasRoutes ? 'none' : 'block';
        document.getElementById('route-main-ui').style.display = hasRoutes ? 'flex' : 'none'; // Use flex for pane-container
    };

    const renderRuntimeMetrics = () => {
        const runtimeStatus = window._mqb_runtime_status || {};
        const throughputMap = runtimeStatus.route_throughput || {};
        document.querySelectorAll('#route-list .route-throughput').forEach((node) => {
            const routeName = node.getAttribute('data-route-name');
            node.textContent = formatThroughput(Number(throughputMap[routeName] || 0));
        });
    };

    renderSidebar();
    renderRuntimeMetrics();
    window.renderRoutesRuntimeMetrics = renderRuntimeMetrics;
    ['route-copy', 'route-clone', 'route-save', 'route-toggle', 'route-delete'].forEach(preserveToolbarClick);

    const setActiveItem = (idx) => {
        currentIdx = idx;
        document.querySelectorAll('#route-list .route-item').forEach((btn, i) => {
            btn.classList.toggle('active', i === idx);
        });
    };

    const syncRouteToggleButton = () => {
        const route = routesArray[currentIdx];
        const toggleBtn = document.getElementById('route-toggle');
        if (!toggleBtn || !route) return;

        const enabled = isRouteEnabled(route);
        toggleBtn.textContent = enabled ? 'Disable' : 'Enable';
        toggleBtn.variant = enabled ? 'danger' : 'success';
        toggleBtn.appearance = enabled ? 'outlined' : 'filled';
        toggleBtn.title = enabled
            ? 'Disable this route and stop deploying it on save'
            : 'Enable this route and deploy it again on save';
        toggleBtn.style.display = '';
    };

    const updateUI = async () => {
        if (routesArray.length === 0) return;
        const idx = currentIdx;
        const routeName = routesArray[idx].name;

        const configFormContainer = document.getElementById('route-config-form');
        if (!configFormContainer) return;

        configFormContainer.innerHTML = '';
        const routeSchema = JSON.parse(JSON.stringify({ 
            ...schema.properties.routes.additionalProperties, 
            $defs: schema.$defs 
        }));
        applyEndpointSchemaDefaults(routeSchema);
        syncRouteToggleButton();
        window._mqb_form_mode = 'route';
        try {
            await lib.init(configFormContainer, routeSchema, { name: routeName, ...config.routes[routeName] }, (updated) => {
                const oldName = routeName; // Capture the original name
                const { nextName: newName, routeData } = splitRouteFormData(oldName, updated);

                if (newName && newName !== oldName) {
                    // Name has changed, update the config object
                    delete config.routes[oldName];
                    config.routes[newName] = routeData;
                    window.refreshDirtySection('routes');
                    // Re-initialize the entire routes tab to reflect the name change in the sidebar
                    window.initRoutes(config, schema);
                    // After re-initialization, find the new index of the renamed route and set it active
                    const newIdx = Object.keys(config.routes).indexOf(newName);
                    if (newIdx !== -1) setActiveItem(newIdx);
                } else {
                    // Name did not change, just update the config object
                    config.routes[oldName] = routeData;
                    routesArray[idx] = { name: oldName, ...routeData };
                    renderSidebar();
                    renderRuntimeMetrics();
                    setActiveItem(idx);
                    syncRouteToggleButton();
                    window.refreshDirtySection('routes');
                }
            });
        } finally {
            window._mqb_form_mode = null;
        }
        watchRouteValidationNoise(configFormContainer);
    };

    // This function is called by index.html when the routes tab is activated
    const restoreRouteState = async (idx) => {
        if (routesArray.length === 0) {
            // If no routes, ensure the "add new" button is functional
            document.getElementById('route-add').onclick = async () => {
                const name = await window.mqbPrompt("Choose a name for the new route.", "Add Route", { placeholder: "my_route" });
                if (!name) return;
                if (config.routes[name]) return window.mqbAlert("Route already exists");
                config.routes[name] = {
                    enabled: true,
                    input: { middlewares: defaultMetricsMiddleware(), null: null },
                    output: { middlewares: defaultMetricsMiddleware(), null: null }
                    // Add default view properties if needed
                };
                window.initRoutes(config, schema); // Re-initialize to re-render the whole UI
                setActiveItem(Object.keys(config.routes).length - 1);
                updateUI();
            };
            return;
        }
        // Ensure the main UI is visible if there are routes
        document.getElementById('route-empty-alert').style.display = 'none';
        document.getElementById('route-main-ui').style.display = 'flex';


        setActiveItem(idx);
        await updateUI();
    };

    routeList.onclick = (e) => {
        const btn = e.target.closest('.route-item');
        if (btn) {
            setActiveItem(parseInt(btn.getAttribute('data-idx')));
            updateUI();
        }
    };

    document.getElementById('route-filter').oninput = (e) => {
        const val = e.target.value.toLowerCase();
        document.querySelectorAll('#route-list .route-item').forEach(btn => {
            const name = btn.querySelector('.item-name').textContent.toLowerCase();
            btn.style.display = name.includes(val) ? 'flex' : 'none';
        });
    };

    // Only set up add button if no routes exist initially
    if (routesArray.length === 0) {
        document.getElementById('route-add').onclick = async () => {
            const name = await window.mqbPrompt("Choose a name for the new route.", "Add Route", { placeholder: "my_route" });
            if (!name) return;
            if (config.routes[name]) return window.mqbAlert("Route already exists");
            config.routes[name] = {
                enabled: true,
                input: { middlewares: defaultMetricsMiddleware(), null: null },
                output: { middlewares: defaultMetricsMiddleware(), null: null }
            };
            window.initRoutes(config, schema); // Re-initialize to re-render the whole UI
            setActiveItem(Object.keys(config.routes).length - 1);
            updateUI();
        };
        // Hide main UI elements if no routes
        document.getElementById('route-main-ui').style.display = 'none';
        document.getElementById('route-empty-alert').style.display = 'block';
    } else {
        document.getElementById('route-add').onclick = async () => {
            const name = await window.mqbPrompt("Choose a name for the new route.", "Add Route", { placeholder: "my_route" });
            if (!name) return;
            if (config.routes[name]) return window.mqbAlert("Route already exists");
            config.routes[name] = {
                enabled: true,
                input: { middlewares: defaultMetricsMiddleware(), null: null },
                output: { middlewares: defaultMetricsMiddleware(), null: null }
            };
            window.initRoutes(config, schema); // Re-initialize to re-render the whole UI
            setActiveItem(Object.keys(config.routes).length - 1);
            updateUI();
        };

        document.getElementById('route-clone').onclick = () => {
            const currentRoute = getCurrentRouteEntry();
            if (!currentRoute) return;
            const currentName = currentRoute.name;
            const newName = currentName + '_copy';
            if (config.routes[newName]) return window.mqbAlert("Cloned route name already exists. Please choose a different name.");
            config.routes[newName] = JSON.parse(JSON.stringify(config.routes[currentName]));
            window.initRoutes(config, schema); // Re-initialize to re-render the whole UI
            setActiveItem(Object.keys(config.routes).length - 1);
            updateUI();
        };

        document.getElementById('route-delete').onclick = async () => {
            if (!await window.mqbConfirm("Delete this route?", "Delete Route")) return;
            const currentRoute = getCurrentRouteEntry();
            if (!currentRoute) return;
            const nameToDelete = currentRoute.name;
            delete config.routes[nameToDelete];
            const nextIdx = Math.max(0, currentIdx - 1);
            const saved = await window.saveConfigSection('routes', config.routes, false, document.getElementById('route-save'));
            if (!saved) return;

            const refreshedConfig = await window.fetchConfigFromServer();
            window.appConfig.routes = refreshedConfig.routes;
            config.routes = refreshedConfig.routes;
            syncRoutesArrayFromConfig(refreshedConfig.routes);
            window.markSectionSaved('routes', refreshedConfig.routes);
            await window.pollRuntimeStatus();
            renderSidebar();
            renderRuntimeMetrics();
            if (Object.keys(window.appConfig.routes || {}).length > 0) {
                setActiveItem(nextIdx);
                await updateUI();
                settleRouteSavedState();
            } else {
                document.getElementById('route-main-ui').style.display = 'none';
                document.getElementById('route-empty-alert').style.display = 'block';
                settleRouteSavedState();
            }
        };

        document.getElementById('route-toggle').onclick = async (e) => {
            const currentRouteEntry = getCurrentRouteEntry();
            if (!currentRouteEntry) return;
            const routeName = currentRouteEntry.name;
            const currentRoute = config.routes[routeName];
            if (!currentRoute) return;

            const previousEnabled = isRouteEnabled(currentRoute);
            currentRoute.enabled = !isRouteEnabled(currentRoute);
            routesArray[currentIdx] = { name: routeName, ...currentRoute };
            renderSidebar();
            renderRuntimeMetrics();
            setActiveItem(currentIdx);
            syncRouteToggleButton();

            const saved = await window.saveConfigSection('routes', config.routes, false, e.currentTarget);
            if (!saved) {
                currentRoute.enabled = previousEnabled;
                routesArray[currentIdx] = { name: routeName, ...currentRoute };
                renderSidebar();
                renderRuntimeMetrics();
                setActiveItem(currentIdx);
                syncRouteToggleButton();
                return;
            }

            const refreshedConfig = await window.fetchConfigFromServer();
            window.appConfig.routes = refreshedConfig.routes;
            await window.pollRuntimeStatus();
            window.initRoutes(window.appConfig, window.appSchema);
            const refreshedIdx = Object.keys(window.appConfig.routes || {}).indexOf(routeName);
            if (refreshedIdx !== -1) {
                window.restoreRouteState(refreshedIdx);
            }
        };

        document.getElementById('route-save').onclick = async (e) => {
            const currentRoute = getCurrentRouteEntry();
            const selectedName = currentRoute?.name || null;
            const saved = await window.saveConfigSection('routes', config.routes, false, e.currentTarget);
            if (!saved) return;

            const refreshedConfig = await window.fetchConfigFromServer();
            window.appConfig.routes = refreshedConfig.routes;
            config.routes = refreshedConfig.routes;
            syncRoutesArrayFromConfig(refreshedConfig.routes);
            window.markSectionSaved('routes', refreshedConfig.routes);
            await window.pollRuntimeStatus();

            const refreshedIdx = selectedName
                ? Object.keys(window.appConfig.routes || {}).indexOf(selectedName)
                : 0;
            if (refreshedIdx !== -1) {
                renderSidebar();
                renderRuntimeMetrics();
                setActiveItem(refreshedIdx);
                await updateUI();
                settleRouteSavedState();
            }
        };
        document.getElementById('route-copy').onclick = copyCurrentRoute;
    }

    // Mark as initialized and expose the restore function
    window._mqb_routes_initialized = true;
    window.restoreRouteState = restoreRouteState;

    // Initial setup if routes exist
    if (routesArray.length > 0) {
        const toggleBtn = document.getElementById('route-toggle');
        if (toggleBtn) toggleBtn.style.display = '';
        setActiveItem(0);
        updateUI();
    } else {
        document.getElementById('route-main-ui').style.display = 'none';
        document.getElementById('route-empty-alert').style.display = 'block';
        const toggleBtn = document.getElementById('route-toggle');
        if (toggleBtn) toggleBtn.style.display = 'none';
    }
}

async function initSettings(config, schema) {
    const lib = window.VanillaSchemaForms;
    const container = document.getElementById('form-container');
    window.registerDirtySection('config', {
        buttonId: 'js-submit',
        getValue: () => window.appConfig,
    });
    window._mqb_form_mode = 'settings';
    const form = await lib.init(container, JSON.parse(JSON.stringify(schema)), config);
    window._mqb_form_mode = null;

    const formActions = document.getElementById('form-actions');
    if (formActions) formActions.style.display = 'flex';
    const submitBtn = document.getElementById('js-submit');
    if (submitBtn) submitBtn.onclick = (e) => window.saveConfig(false, e.currentTarget);

    const scheduleDirtyRefresh = () => window.setTimeout(() => window.refreshDirtySection('config'), 0);
    container.oninput = scheduleDirtyRefresh;
    container.onchange = scheduleDirtyRefresh;

    let desktopSecretsBtn = document.getElementById('js-delete-desktop-secrets');
    let desktopSecretsCheckBtn = document.getElementById('js-check-desktop-secrets');
    if (window.__MQB_DESKTOP__ && formActions && !desktopSecretsBtn) {
        desktopSecretsCheckBtn = lib.h('wa-button', { id: 'js-check-desktop-secrets' }, 'Check Stored Secrets');
        desktopSecretsCheckBtn.setAttribute('variant', 'neutral');
        desktopSecretsCheckBtn.setAttribute('appearance', 'outlined');
        desktopSecretsCheckBtn.setAttribute('size', 'small');
        formActions.appendChild(desktopSecretsCheckBtn);

        desktopSecretsBtn = lib.h('wa-button', { id: 'js-delete-desktop-secrets' }, 'Delete Stored Secrets');
        desktopSecretsBtn.setAttribute('variant', 'danger');
        desktopSecretsBtn.setAttribute('appearance', 'outlined');
        desktopSecretsBtn.setAttribute('size', 'small');
        formActions.appendChild(desktopSecretsBtn);
    }

    if (desktopSecretsBtn) {
        desktopSecretsBtn.onclick = async (event) => {
            try {
                const confirmed = await window.mqbConfirm(
                    'Delete all securely stored secrets referenced by the current desktop config?',
                    'Delete Stored Secrets',
                );
                if (!confirmed) return;

                const response = await fetch('/desktop-secrets', { method: 'DELETE' });
                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(text || 'Failed to delete stored secrets');
                }

                const result = await response.json().catch(() => ({ deleted: 0 }));
                const deleted = Number(result?.deleted || 0);
                await window.mqbAlert(
                    deleted > 0
                        ? `Deleted ${deleted} stored secret${deleted === 1 ? '' : 's'}.`
                        : 'No stored secrets were found for the current desktop config.',
                    'Stored Secrets',
                );
            } catch (error) {
                await window.mqbAlert(`Failed to delete stored secrets: ${error.message}`, 'Stored Secrets');
            }
        };
    }

    if (desktopSecretsCheckBtn) {
        desktopSecretsCheckBtn.onclick = async () => {
            try {
                const response = await fetch('/desktop-secrets', { cache: 'no-store' });
                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(text || 'Failed to inspect stored secrets');
                }

                const summary = await response.json();
                const groups = [
                    ['Routes', summary.routes || {}],
                    ['Consumers', summary.consumers || {}],
                    ['Publishers', summary.publishers || {}],
                ];

                const lines = [];
                for (const [label, entries] of groups) {
                    const names = Object.keys(entries).sort();
                    if (names.length === 0) continue;
                    lines.push(`${label}:`);
                    for (const name of names) {
                        const items = entries[name] || [];
                        const extracted = items.filter((item) => item.extracted).length;
                        const stored = items.filter((item) => item.stored).length;
                        const total = items.length;
                        lines.push(`- ${name}: ${extracted}/${total} extracted, ${stored}/${total} stored`);
                        const errors = items
                            .filter((item) => item.error)
                            .map((item) => `${item.key}: ${item.error}`);
                        errors.forEach((message) => lines.push(`  ${message}`));
                    }
                }

                const message = lines.length > 0
                    ? lines.join('\n')
                    : 'The current desktop config does not reference any extracted secrets.';
                await window.mqbAlert(message, 'Stored Secrets');
            } catch (error) {
                await window.mqbAlert(`Failed to inspect stored secrets: ${error.message}`, 'Stored Secrets');
            }
        };
    }
}

window.initRoutes = initRoutes;
window.initSettings = initSettings;
