async function initRoutes(config, schema) {
    const lib = window.VanillaSchemaForms;
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

    const renderSidebar = () => {
        if (!routeList) return;
        routeList.innerHTML = '<div class="sidebar-group-label">Routes</div>' +
            routesArray.map((r, i) => {
                const inputProto =
                  Object.keys(r.input)
                  .filter((key) => key !== "middlewares")[0]?.toUpperCase() || "N/A";
                const outputProto =
                  Object.keys(r.output)
                    .filter((key) => key !== "middlewares")[0]?.toUpperCase() || "N/A";
                const metricsBadge = isRouteEnabled(r) && hasMetricsMiddleware(r)
                    ? `<span class="route-throughput" data-route-name="${r.name}">0 msg/s</span>`
                    : '';
                const disabledClass = isRouteEnabled(r) ? '' : ' is-disabled';
                return `
                    <div class="sidebar-item route-item${disabledClass}" data-idx="${i}">
                        <span class="proto-badge proto-${inputProto.toLowerCase()}">${inputProto.substring(0,4)}</span>
                        <span class="item-name">${r.name}</span>
                        ${metricsBadge}
                        ${isRouteEnabled(r) ? '' : '<span class="route-disabled-tag">OFF</span>'}
                        <span class="proto-badge proto-${outputProto.toLowerCase()}" style="margin-left:auto;">${outputProto.substring(0,4)}</span>
                    </div>
                `;
            }).join('');

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
        watchRouteValidationNoise(configFormContainer);
    };

    // This function is called by index.html when the routes tab is activated
    const restoreRouteState = async (idx) => {
        if (routesArray.length === 0) {
            // If no routes, ensure the "add new" button is functional
            document.getElementById('route-add').onclick = () => {
                const name = prompt("Route Name:");
                if (!name) return;
                if (config.routes[name]) return alert("Route already exists");
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
        document.getElementById('route-add').onclick = () => {
            const name = prompt("Route Name:");
            if (!name) return;
            if (config.routes[name]) return alert("Route already exists");
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
        document.getElementById('route-add').onclick = () => {
            const name = prompt("Route Name:");
            if (!name) return;
            if (config.routes[name]) return alert("Route already exists");
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
            if (config.routes[newName]) return alert("Cloned route name already exists. Please choose a different name.");
            config.routes[newName] = JSON.parse(JSON.stringify(config.routes[currentName]));
            window.initRoutes(config, schema); // Re-initialize to re-render the whole UI
            setActiveItem(Object.keys(config.routes).length - 1);
            updateUI();
        };

        document.getElementById('route-delete').onclick = () => {
            if (routesArray.length <= 1) return alert("Cannot delete last route");
            if (!confirm("Delete this route?")) return;
            const nameToDelete = routesArray[currentIdx].name;
            delete config.routes[nameToDelete];
            window.initRoutes(config, schema); // Re-initialize to re-render the whole UI
            setActiveItem(0); // Select first item after deletion
            updateUI();
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

            const saved = await window.saveConfig(false, e.currentTarget);
            if (!saved) {
                currentRoute.enabled = previousEnabled;
                routesArray[currentIdx] = { name: routeName, ...currentRoute };
                renderSidebar();
                renderRuntimeMetrics();
                setActiveItem(currentIdx);
                syncRouteToggleButton();
                return;
            }

            const refreshedConfig = await (await fetch('/config')).json();
            window.appConfig = refreshedConfig;
            await window.pollRuntimeStatus();
            window.initRoutes(window.appConfig, window.appSchema);
            const refreshedIdx = Object.keys(window.appConfig.routes || {}).indexOf(routeName);
            if (refreshedIdx !== -1) {
                window.restoreRouteState(refreshedIdx);
            }
        };

        document.getElementById('route-save').onclick = (e) => window.saveConfig(false, e.currentTarget);
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
    const form = await lib.init(container, JSON.parse(JSON.stringify(schema)), config);

    const formActions = document.getElementById('form-actions');
    if (formActions) formActions.style.display = 'flex';
    const submitBtn = document.getElementById('js-submit');
    if (submitBtn) submitBtn.onclick = (e) => window.saveConfig(false, e.currentTarget);
}

window.initRoutes = initRoutes;
window.initSettings = initSettings;
