use crate::config::AppConfig;
use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use schemars::schema_for;
use std::sync::RwLock;

type CurrentConfig = RwLock<AppConfig>;

async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("OK")
}

async fn get_schema() -> impl Responder {
    let schema = schema_for!(AppConfig);
    HttpResponse::Ok().json(schema)
}

async fn get_js_lib() -> impl Responder {
    const JS_LIB: &str = include_str!("../static/vanilla-schema-forms.js");
    HttpResponse::Ok()
        .content_type("text/javascript")
        .body(JS_LIB)
}

async fn get_js_custom_lib() -> impl Responder {
    const JS_CUSTOM_LIB: &str = include_str!("../static/custom-form.js");
    HttpResponse::Ok()
        .content_type("text/javascript")
        .body(JS_CUSTOM_LIB)
}

async fn get_bootstrap_css() -> impl Responder {
    const CSS: &str = include_str!("../static/bootstrap.min.css");
    HttpResponse::Ok().content_type("text/css").body(CSS)
}

async fn index() -> impl Responder {
    let html = include_str!("../static/index.html");
    HttpResponse::Ok().content_type("text/html").body(html)
}

async fn get_config(config: web::Data<CurrentConfig>) -> impl Responder {
    let config_guard = config.read().unwrap();
    let mut current_config = config_guard.clone();
    current_config.routes = mq_bridge::list_routes()
        .into_iter()
        .filter_map(|name| mq_bridge::get_route(&name).map(|route| (name, route)))
        .collect();
    HttpResponse::Ok().json(current_config)
}

// Keep in mind, there is no auhorization or authentication here
async fn update_config(
    body: web::Bytes,
    current_config_data: web::Data<CurrentConfig>,
) -> impl Responder {
    let mut new_config: AppConfig = match serde_json::from_slice(&body) {
        Ok(cfg) => cfg,
        Err(e) => {
            let mut msg = format!("Json deserialize error: {}", e);
            // Attempt to provide context around the error location
            if e.line() == 1 {
                let col = e.column();
                let idx = col.saturating_sub(1);
                let len = body.len();
                let start = idx.saturating_sub(30);
                let end = (idx + 30).min(len);
                let snippet = String::from_utf8_lossy(&body[start..end]);
                msg.push_str(&format!("\nAt: ...{}...", snippet));
            }
            tracing::error!("{}", msg);
            return HttpResponse::BadRequest().body(msg);
        }
    };

    tracing::info!("Received new configuration via Web UI. Reloading...");

    // Check first
    let routes = std::mem::take(&mut new_config.routes);
    for (name, route) in &routes {
        if let Err(e) = route.check(&name, None) {
            tracing::error!("Route {}: validation failed: {}", name, e);
            return HttpResponse::InternalServerError()
                .body(format!("Failed to validate route {}: {}", name, e));
        }
    }

    let old_routes = mq_bridge::list_routes();
    // Stop old routes that are not in the new configuration
    for name in old_routes {
        if !routes.contains_key(&name) {
            mq_bridge::stop_route(&name).await;
        }
    }

    // Update shared state
    {
        let mut config_guard = current_config_data.write().unwrap();
        new_config.routes = routes.clone(); // put routes back for storage

        let config_file = std::env::var("CONFIG_FILE").unwrap_or_else(|_| "config.yml".to_string());
        match serde_yaml_ng::to_string(&new_config) {
            Ok(yaml) => {
                if let Err(e) = std::fs::write(&config_file, yaml) {
                    tracing::error!("Failed to write config to {}: {}", config_file, e);
                } else {
                    tracing::info!("Configuration saved to {}", config_file);
                }
            }
            Err(e) => tracing::error!("Failed to serialize config: {}", e),
        }

        *config_guard = new_config;
    }
    // Deploy new routes
    for (name, route) in &routes {
        if let Err(e) = route.deploy(name).await {
            return HttpResponse::InternalServerError()
                .body(format!("Failed to deploy route {}: {}", name, e));
        }
    }

    HttpResponse::Ok().body("Configuration updated")
}

pub fn start_web_server(
    bind_addr: &str,
    initial_config: AppConfig,
) -> std::io::Result<actix_web::dev::Server> {
    tracing::info!("Starting Web UI on http://{}", bind_addr);
    let config_data = web::Data::new(RwLock::new(initial_config));
    let server = HttpServer::new(move || {
        let app = App::new()
            .app_data(config_data.clone())
            .route("/health", web::get().to(health_check))
            .route("/schema.json", web::get().to(get_schema))
            .route("/vanilla-schema-forms.js", web::get().to(get_js_lib))
            .route("/custom-form.js", web::get().to(get_js_custom_lib))
            .route("/bootstrap.min.css", web::get().to(get_bootstrap_css))
            .route("/", web::get().to(index))
            .route("/config", web::post().to(update_config))
            .route("/config", web::get().to(get_config));
        app
    })
    .bind(bind_addr)?
    .run();
    Ok(server)
}
