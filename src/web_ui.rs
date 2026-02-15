use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use crate::config::AppConfig;
use schemars::schema_for;
use tokio::sync::mpsc::Sender;

async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("OK")
}

async fn get_schema() -> impl Responder {
    let schema = schema_for!(AppConfig);
    HttpResponse::Ok().json(schema)
}

async fn index() -> impl Responder {
    let html = include_str!("../static/index.html");
    HttpResponse::Ok().content_type("text/html").body(html)
}

async fn update_config(
    config: web::Json<AppConfig>,
    tx: web::Data<Sender<AppConfig>>,
) -> impl Responder {
    match tx.send(config.into_inner()).await {
        Ok(_) => HttpResponse::Ok().body("Configuration updated"),
        Err(_) => HttpResponse::InternalServerError().body("Failed to send configuration"),
    }
}

pub fn start_web_server(port: u16, config_tx: Sender<AppConfig>) -> std::io::Result<actix_web::dev::Server> {
    tracing::info!("Starting Web UI on port {}", port);
    let server = HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(config_tx.clone()))
            .route("/health", web::get().to(health_check))
            .route("/schema.json", web::get().to(get_schema))
            .route("/", web::get().to(index))
            .route("/config", web::post().to(update_config))
    })
    .bind(("0.0.0.0", port))?
    .run();
    Ok(server)
}