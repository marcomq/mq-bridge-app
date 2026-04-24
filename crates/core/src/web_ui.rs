use crate::config::AppConfig;
use crate::ui_app::UiApp;
use anyhow::Result;
use mq_bridge::models::{Endpoint, EndpointType, HttpConfig, Route};
use mq_bridge::{CanonicalMessage, HandlerError};

#[derive(Clone)]
struct WebUiHttpHandler {
    app: UiApp,
}

impl WebUiHttpHandler {
    async fn handle(&self, msg: CanonicalMessage) -> Result<mq_bridge::Handled, HandlerError> {
        self.app.handle_ui_message(msg, true).await
    }
}

/// Start Web UI
pub async fn start_web_server(
    bind_addr: String,
    initial_config: AppConfig,
    metrics_handle: metrics_exporter_prometheus::PrometheusHandle,
    config_file_path: String,
) -> Result<(), anyhow::Error> {
    let bind_addr = bind_addr.to_string();
    let app = UiApp::new(initial_config, metrics_handle, config_file_path);

    let input = Endpoint {
        endpoint_type: EndpointType::Http(HttpConfig {
            url: bind_addr,
            workers: Some(100),
            ..Default::default()
        }),
        ..Default::default()
    };

    let output = Endpoint {
        endpoint_type: EndpointType::Response(Default::default()),
        ..Default::default()
    };

    let web_handler = WebUiHttpHandler { app };
    let mut web_route = Route::new(input, output).with_handler(move |msg| {
        let handler = web_handler.clone();
        async move { handler.handle(msg).await }
    });
    web_route.options.concurrency = 100;

    let handle = web_route.run("web_ui").await;
    let handle = handle.expect("Failed to start Web UI");
    std::future::pending::<()>().await;
    let _ = handle.join().await;

    Ok(())
}
