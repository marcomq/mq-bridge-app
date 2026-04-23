async function initRoutes(config, schema) {
    const lib = window.VanillaSchemaForms;
    const container = document.getElementById('routes-container');
    const applyEndpointSchemaDefaults = (routeSchema) => {
        const fileConfigSchema = routeSchema.$defs?.FileConfig;
        if (fileConfigSchema?.properties?.format) {
            fileConfigSchema.properties.format.default = 'raw';
        }

        const mongoDbConfigSchema = routeSchema.$defs?.MongoDbConfig;
        if (mongoDbConfigSchema?.properties?.format) {
            mongoDbConfigSchema.properties.format.default = 'raw';
        }
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
                return `
                    <div class="sidebar-item route-item" data-idx="${i}">
                        <span class="proto-badge proto-${inputProto.toLowerCase()}">${inputProto.substring(0,4)}</span>
                        <span class="item-name">${r.name}</span>
                        <span class="proto-badge proto-${outputProto.toLowerCase()}" style="margin-left:auto;">${outputProto.substring(0,4)}</span>
                    </div>
                `;
            }).join('');

        const hasRoutes = routesArray.length > 0;
        document.getElementById('route-empty-alert').style.display = hasRoutes ? 'none' : 'block';
        document.getElementById('route-main-ui').style.display = hasRoutes ? 'flex' : 'none'; // Use flex for pane-container
    };

    renderSidebar();

    const setActiveItem = (idx) => {
        currentIdx = idx;
        document.querySelectorAll('#route-list .route-item').forEach((btn, i) => {
            btn.classList.toggle('active', i === idx);
        });
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
                // Update protocol badges in the sidebar if input/output changed
                const currentRouteItem = document.querySelector(`#route-list .route-item[data-idx="${idx}"]`);
                if (currentRouteItem) {
                    const inputProto =
                      Object.keys(updated.input)
                        .filter((key) => key !== "middlewares")[0]
                        ?.toUpperCase() || "N/A";
                    const outputProto =
                      Object.keys(updated.output)
                        .filter((key) => key !== "middlewares")[0]
                        ?.toUpperCase() || "N/A";
                    currentRouteItem.querySelector('.proto-badge:first-of-type').textContent = inputProto;
                    currentRouteItem.querySelector('.proto-badge:first-of-type').className = `proto-badge proto-${inputProto.toLowerCase()}`;
                    currentRouteItem.querySelector('.proto-badge:last-of-type').textContent = outputProto;
                    currentRouteItem.querySelector('.proto-badge:last-of-type').className = `proto-badge proto-${outputProto.toLowerCase()}`;
                }
            }
        });
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
                    input: { null: null },
                    output: { middlewares: [], null: null }
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
                input: { null: null },
                output: { middlewares: [], null: null }
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
                input: { null: null },
                output: { middlewares: [], null: null }
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
    }

    // Mark as initialized and expose the restore function
    window._mqb_routes_initialized = true;
    window.restoreRouteState = restoreRouteState;

    // Initial setup if routes exist
    if (routesArray.length > 0) {
        setActiveItem(0);
        updateUI();
    } else {
        document.getElementById('route-main-ui').style.display = 'none';
        document.getElementById('route-empty-alert').style.display = 'block';
    }
}

async function initSettings(config, schema) {
    const lib = window.VanillaSchemaForms;
    const container = document.getElementById('form-container');
    const form = await lib.init(container, JSON.parse(JSON.stringify(schema)), config);

    const formActions = document.getElementById('form-actions');
    if (formActions) formActions.style.display = 'flex';
    const submitBtn = document.getElementById('js-submit');
    if (submitBtn) submitBtn.onclick = () => window.saveConfig();
}

window.initRoutes = initRoutes;
window.initSettings = initSettings;
