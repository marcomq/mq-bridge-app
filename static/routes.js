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
            routeSchema.properties.enabled.hidden = true;
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

    let currentIdx = 0; // Currently active route index

    // The container HTML is now defined in index.html.
    // We only need to populate dynamic parts and attach event listeners.
    container.style.display = 'contents'; // Ensure the container is visible

    const routeList = document.getElementById('route-list');

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
            await lib.init(configFormContainer, routeSchema, config.routes[routeName], (updated) => {
                const oldName = routeName; // Capture the original name
                const newName = updated.name; // Get the potentially new name from the form

                if (newName && newName !== oldName) {
                    // Name has changed, update the config object
                    delete config.routes[oldName];
                    config.routes[newName] = updated;
                    // Re-initialize the entire routes tab to reflect the name change in the sidebar
                    window.initRoutes(config, schema);
                    // After re-initialization, find the new index of the renamed route and set it active
                    const newIdx = Object.keys(config.routes).indexOf(newName);
                    if (newIdx !== -1) setActiveItem(newIdx);
                } else {
                    // Name did not change, just update the config object
                    config.routes[oldName] = updated;
                    routesArray[idx] = { name: oldName, ...updated };
                    renderSidebar();
                    renderRuntimeMetrics();
                    setActiveItem(idx);
                    syncRouteToggleButton();
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
            const currentName = routesArray[currentIdx].name;
            const newName = currentName + '_copy';
            if (config.routes[newName]) return window.mqbAlert("Cloned route name already exists. Please choose a different name.");
            config.routes[newName] = JSON.parse(JSON.stringify(config.routes[currentName]));
            window.initRoutes(config, schema); // Re-initialize to re-render the whole UI
            setActiveItem(Object.keys(config.routes).length - 1);
            updateUI();
        };

        document.getElementById('route-delete').onclick = async () => {
            if (!await window.mqbConfirm("Delete this route?", "Delete Route")) return;
            const nameToDelete = routesArray[currentIdx].name;
            delete config.routes[nameToDelete];
            if (Object.keys(config.routes).length === 0) {
                await window.saveConfigSection('routes', config.routes, false);
            }
            window.initRoutes(config, schema); // Re-initialize to re-render the whole UI
            if (Object.keys(config.routes).length > 0) {
                setActiveItem(Math.max(0, currentIdx - 1));
                updateUI();
            }
        };

        document.getElementById('route-toggle').onclick = async (e) => {
            const routeName = routesArray[currentIdx].name;
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

        document.getElementById('route-save').onclick = (e) =>
            window.saveConfigSection('routes', config.routes, false, e.currentTarget);
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
    window._mqb_form_mode = 'settings';
    const form = await lib.init(container, JSON.parse(JSON.stringify(schema)), config);
    window._mqb_form_mode = null;

    const formActions = document.getElementById('form-actions');
    if (formActions) formActions.style.display = 'flex';
    const submitBtn = document.getElementById('js-submit');
    if (submitBtn) submitBtn.onclick = (e) => window.saveConfig(false, e.currentTarget);
}

window.initRoutes = initRoutes;
window.initSettings = initSettings;
