async function initRoutes(config, schema) {
    const lib = window.VanillaSchemaForms;
    const container = document.getElementById('routes-container');
    const routes = Object.keys(config.routes || {});

    container.innerHTML = `
        <div class="row">
            <div class="col-md-3 border-end d-flex flex-column gap-2">
                <div class="nav flex-column nav-pills" id="v-pills-tab" role="tablist">
                    ${routes.map((name, i) => `
                        <div class="d-flex align-items-center mb-1">
                            <button class="nav-link flex-grow-1 text-start ${i===0?'active':''}" data-bs-toggle="pill" 
                                    data-bs-target="#route-pane-${i}" type="button">${name}</button>
                            <button class="btn btn-link text-muted p-1 route-clone" data-name="${name}" title="Clone">&#10697;</button>
                            <button class="btn btn-link text-danger p-1 route-delete" data-name="${name}" title="Delete">&times;</button>
                        </div>
                    `).join('')}
                </div>
                <button class="btn btn-outline-secondary btn-sm mt-auto" id="route-add">+ Add Route</button>
                <button class="btn btn-primary btn-sm mt-2" id="route-save">Save Configuration</button>
            </div>
            <div class="col-md-9">
                <div class="tab-content" id="v-pills-tabContent">
                    ${routes.length === 0 ? '<div class="alert alert-info">No routes configured. Click "+ Add Route" to create one.</div>' : ''}
                    ${routes.map((name, i) => `<div class="tab-pane fade ${i===0?'show active':''}" id="route-pane-${i}"></div>`).join('')}
                </div>
            </div>
        </div>`;

    // Initialize form for each route pane
    routes.forEach(async (name, i) => {
        const pane = document.getElementById(`route-pane-${i}`);
        const routeSchema = JSON.parse(JSON.stringify({ 
            ...schema.properties.routes.additionalProperties, 
            $defs: schema.$defs 
        }));
        await lib.init(pane, routeSchema, config.routes[name], (updated) => {
             config.routes[name] = updated;
        });
    });

    document.getElementById('route-add').onclick = () => {
        const name = prompt("Route Name:");
        if (!name || config.routes[name]) return;
        config.routes[name] = { 
            input: { null: null }, 
            output: { middlewares: [], null: null }
        };
        initRoutes(config, schema);
    };

    document.querySelectorAll('.route-clone').forEach(btn => {
        btn.onclick = () => {
            const oldName = btn.getAttribute('data-name');
            const newName = oldName + '_copy';
            config.routes[newName] = JSON.parse(JSON.stringify(config.routes[oldName]));
            initRoutes(config, schema);
        };
    });

    document.querySelectorAll('.route-delete').forEach(btn => {
        btn.onclick = () => {
            if (confirm("Delete route '" + btn.getAttribute('data-name') + "'?")) {
                delete config.routes[btn.getAttribute('data-name')];
                initRoutes(config, schema);
            }
        };
    });

    document.getElementById('route-save').onclick = () => window.saveConfig();
}

async function initSettings(config, schema) {
    const lib = window.VanillaSchemaForms;
    const container = document.getElementById('form-container');
    const form = await lib.init(container, JSON.parse(JSON.stringify(schema)), config);

    document.getElementById('form-actions').style.display = 'flex';
    const submitBtn = document.getElementById('js-submit');
    submitBtn.onclick = () => window.saveConfig();
}

window.initRoutes = initRoutes;
window.initSettings = initSettings;