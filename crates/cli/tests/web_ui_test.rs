use metrics::{Key, Recorder};
use metrics_exporter_prometheus::PrometheusBuilder;
use mq_bridge_app::config::AppConfig;
use mq_bridge_app::web_ui;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::OnceLock;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::task::JoinHandle;
use tokio::time::{Duration, sleep};

fn get_free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap().port()
}

fn test_mutex() -> &'static tokio::sync::Mutex<()> {
    static TEST_MUTEX: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    TEST_MUTEX.get_or_init(|| tokio::sync::Mutex::new(()))
}

fn unique_config_path(port: u16) -> PathBuf {
    std::env::temp_dir().join(format!(
        "mq_bridge_app_test_{}_{}.yml",
        port,
        uuid::Uuid::new_v4()
    ))
}

async fn start_test_server(port: u16, config: AppConfig, config_file: &PathBuf) -> JoinHandle<()> {
    let builder = PrometheusBuilder::new();
    let recorder = builder.build_recorder();
    let handle = recorder.handle();
    let config_file_path = config_file.to_string_lossy().to_string();

    let server = tokio::spawn(async move {
        web_ui::start_web_server(
            format!("127.0.0.1:{}", port),
            config,
            handle,
            config_file_path,
        )
        .await
        .unwrap();
    });

    sleep(Duration::from_millis(200)).await;
    server
}

async fn send_http_request(port: u16, request: &str) -> String {
    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port))
        .await
        .unwrap();
    stream.write_all(request.as_bytes()).await.unwrap();

    let mut buffer = Vec::new();
    stream.read_to_end(&mut buffer).await.unwrap();
    String::from_utf8_lossy(&buffer).into_owned()
}

async fn http_get(port: u16, path: &str) -> String {
    let request = format!(
        "GET {} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        path
    );
    send_http_request(port, &request).await
}

async fn http_post_json(port: u16, path: &str, json_payload: &str) -> String {
    let request = format!(
        "POST {} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        path,
        json_payload.len(),
        json_payload
    );
    send_http_request(port, &request).await
}

async fn http_post(port: u16, path: &str) -> String {
    let request = format!(
        "POST {} HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        path
    );
    send_http_request(port, &request).await
}

fn response_body(response: &str) -> &str {
    response
        .split_once("\r\n\r\n")
        .map(|(_, body)| body)
        .unwrap_or("")
}

async fn read_json_response(port: u16, path: &str) -> serde_json::Value {
    let response = http_get(port, path).await;
    assert!(
        response.contains("200 OK"),
        "unexpected response: {}",
        response
    );
    serde_json::from_str(response_body(&response)).unwrap()
}

async fn stop_all_routes() {
    for route in mq_bridge_app::mq_bridge::list_routes() {
        mq_bridge_app::mq_bridge::stop_route(&route).await;
    }
}

#[tokio::test]
async fn test_web_ui_health_check() {
    let _guard = test_mutex().lock().await;
    stop_all_routes().await;

    let port = get_free_port();
    let config_file = unique_config_path(port);
    let server = start_test_server(port, AppConfig::default(), &config_file).await;

    let response = http_get(port, "/health").await;
    assert!(response.contains("200 OK"));
    assert!(response.contains("OK"));

    server.abort();
    stop_all_routes().await;
    let _ = std::fs::remove_file(config_file);
}

#[tokio::test]
async fn test_web_ui_schema_and_index_expose_custom_ui_shape() {
    let _guard = test_mutex().lock().await;
    stop_all_routes().await;

    let port = get_free_port();
    let config_file = unique_config_path(port);
    let server = start_test_server(port, AppConfig::default(), &config_file).await;

    let schema_response = http_get(port, "/schema.json").await;
    assert!(schema_response.contains("200 OK"));
    assert!(schema_response.contains("\"AppConfig\""));
    assert!(schema_response.contains("\"enabled\""));
    assert!(!schema_response.contains("\"view\""));

    let index_response = http_get(port, "/").await;
    assert!(index_response.contains("200 OK"));
    assert!(index_response.contains("<script src=\"/custom-form.js\"></script>"));
    assert!(index_response.contains("id=\"route-toggle\""));
    assert!(index_response.contains("id=\"pub-proto-label\">Type</span>"));

    server.abort();
    stop_all_routes().await;
    let _ = std::fs::remove_file(config_file);
}

#[tokio::test]
async fn test_web_ui_serves_custom_static_assets() {
    let _guard = test_mutex().lock().await;
    stop_all_routes().await;

    let port = get_free_port();
    let config_file = unique_config_path(port);
    let server = start_test_server(port, AppConfig::default(), &config_file).await;

    let routes_js = http_get(port, "/routes.js").await;
    assert!(routes_js.contains("200 OK"));
    assert!(routes_js.contains("route-toggle"));
    assert!(routes_js.contains("syncRouteToggleButton"));

    let publishers_js = http_get(port, "/publishers.js").await;
    assert!(publishers_js.contains("200 OK"));
    assert!(publishers_js.contains("REQUEST_BAR_LAYOUTS"));
    assert!(publishers_js.contains("getPublishStatusInfo"));

    let consumers_js = http_get(port, "/consumers.js").await;
    assert!(consumers_js.contains("200 OK"));
    assert!(consumers_js.contains("defaultMetricsMiddleware"));

    let style_css = http_get(port, "/style.css").await;
    assert!(style_css.contains("200 OK"));
    assert!(style_css.contains(".route-disabled-tag"));
    assert!(style_css.contains(".request-field-label"));

    server.abort();
    stop_all_routes().await;
    let _ = std::fs::remove_file(config_file);
}

#[tokio::test]
async fn test_web_ui_post_config_deploys_enabled_route() {
    let _guard = test_mutex().lock().await;
    stop_all_routes().await;

    let port = get_free_port();
    let config_file = unique_config_path(port);
    let server = start_test_server(port, AppConfig::default(), &config_file).await;

    let route_name = format!("test_route_{}", uuid::Uuid::new_v4().simple());
    let json_payload = format!(
        r#"{{"log_level":"debug","logger":"plain","routes":{{"{route_name}":{{"enabled":true,"input":{{"memory":{{"topic":"in"}}}},"output":{{"memory":{{"topic":"out"}}}}}}}}}}"#
    );
    let response = http_post_json(port, "/config", &json_payload).await;
    assert!(
        response.contains("200 OK"),
        "unexpected response: {}",
        response
    );

    sleep(Duration::from_millis(200)).await;
    let routes = mq_bridge_app::mq_bridge::list_routes();
    assert!(routes.contains(&route_name));

    mq_bridge_app::mq_bridge::stop_route(&route_name).await;
    server.abort();
    stop_all_routes().await;
    let _ = std::fs::remove_file(config_file);
}

#[tokio::test]
async fn test_consumer_custom_response_is_returned_for_http_consumer() {
    let _guard = test_mutex().lock().await;
    stop_all_routes().await;

    let ui_port = get_free_port();
    let consumer_port = get_free_port();
    let config_file = unique_config_path(ui_port);
    let server = start_test_server(ui_port, AppConfig::default(), &config_file).await;

    let consumer_name = format!("test_consumer_{}", uuid::Uuid::new_v4().simple());
    let json_payload = format!(
        r#"{{
            "log_level":"debug",
            "logger":"plain",
            "consumers":[{{
                "name":"{consumer_name}",
                "endpoint":{{"http":{{"url":"127.0.0.1:{consumer_port}"}}}},
                "comment":"",
                "response":{{
                    "headers":{{"Content-Type":"application/json","X-Test-Reply":"configured"}},
                    "payload":"{{\"ok\":true}}"
                }}
            }}]
        }}"#
    );
    let response = http_post_json(ui_port, "/config", &json_payload).await;
    assert!(
        response.contains("200 OK"),
        "unexpected response: {}",
        response
    );

    let start_response = http_post(
        ui_port,
        &format!("/consumer-start?consumer={consumer_name}"),
    )
    .await;
    assert!(
        start_response.contains("200 OK"),
        "unexpected response: {}",
        start_response
    );

    sleep(Duration::from_millis(200)).await;

    let consumer_response = send_http_request(
        consumer_port,
        "POST / HTTP/1.1\r\nHost: localhost\r\nContent-Type: text/plain\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello",
    )
    .await;
    assert!(
        consumer_response.contains("200 OK"),
        "unexpected consumer response: {}",
        consumer_response
    );
    let consumer_response_lower = consumer_response.to_ascii_lowercase();
    assert!(consumer_response_lower.contains("x-test-reply: configured"));
    assert!(consumer_response_lower.contains("content-type: application/json"));
    assert!(consumer_response.contains("{\"ok\":true}"));

    server.abort();
    stop_all_routes().await;
    let _ = std::fs::remove_file(config_file);
}

#[tokio::test]
async fn test_web_ui_post_config_accepts_disabled_route_without_deploying_it() {
    let _guard = test_mutex().lock().await;
    stop_all_routes().await;

    let port = get_free_port();
    let config_file = unique_config_path(port);
    let server = start_test_server(port, AppConfig::default(), &config_file).await;

    let route_name = format!("disabled_route_{}", uuid::Uuid::new_v4().simple());
    let json_payload = format!(
        r#"{{"log_level":"debug","logger":"plain","routes":{{"{route_name}":{{"enabled":false,"input":{{"memory":{{"topic":"disabled-in"}}}},"output":{{"memory":{{"topic":"disabled-out"}}}}}}}}}}"#
    );
    let response = http_post_json(port, "/config", &json_payload).await;
    assert!(
        response.contains("200 OK"),
        "unexpected response: {}",
        response
    );

    sleep(Duration::from_millis(200)).await;
    let routes = mq_bridge_app::mq_bridge::list_routes();
    assert!(!routes.contains(&route_name));

    let config_json = read_json_response(port, "/config").await;
    assert_eq!(config_json["routes"][&route_name]["enabled"], false);

    server.abort();
    stop_all_routes().await;
    let _ = std::fs::remove_file(config_file);
}

#[tokio::test]
async fn test_web_ui_can_disable_existing_route_and_runtime_status_updates() {
    let _guard = test_mutex().lock().await;
    stop_all_routes().await;

    let port = get_free_port();
    let config_file = unique_config_path(port);
    let server = start_test_server(port, AppConfig::default(), &config_file).await;

    let route_name = format!("toggle_route_{}", uuid::Uuid::new_v4().simple());
    let enabled_payload = format!(
        r#"{{"log_level":"debug","logger":"plain","routes":{{"{route_name}":{{"enabled":true,"input":{{"memory":{{"topic":"toggle-in"}}}},"output":{{"memory":{{"topic":"toggle-out"}}}}}}}}}}"#
    );
    let response = http_post_json(port, "/config", &enabled_payload).await;
    assert!(
        response.contains("200 OK"),
        "unexpected response: {}",
        response
    );

    sleep(Duration::from_millis(200)).await;
    let runtime_before = read_json_response(port, "/runtime-status").await;
    assert!(
        runtime_before["active_routes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|name| name == &serde_json::Value::String(route_name.clone()))
    );

    let disabled_payload = format!(
        r#"{{"log_level":"debug","logger":"plain","routes":{{"{route_name}":{{"enabled":false,"input":{{"memory":{{"topic":"toggle-in"}}}},"output":{{"memory":{{"topic":"toggle-out"}}}}}}}}}}"#
    );
    let response = http_post_json(port, "/config", &disabled_payload).await;
    assert!(
        response.contains("200 OK"),
        "unexpected response: {}",
        response
    );

    sleep(Duration::from_millis(200)).await;
    let routes = mq_bridge_app::mq_bridge::list_routes();
    assert!(!routes.contains(&route_name));

    let runtime_after = read_json_response(port, "/runtime-status").await;
    assert!(
        !runtime_after["active_routes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|name| name == &serde_json::Value::String(route_name.clone()))
    );

    server.abort();
    stop_all_routes().await;
    let _ = std::fs::remove_file(config_file);
}

#[tokio::test]
async fn test_web_ui_metrics_endpoint() {
    let _guard = test_mutex().lock().await;
    stop_all_routes().await;

    let port = get_free_port();
    let config_file = unique_config_path(port);
    let builder = PrometheusBuilder::new();
    let recorder = builder.build_recorder();
    let handle = recorder.handle();

    let key = Key::from_name("test_metric");
    let metadata = metrics::Metadata::new("test_metric", metrics::Level::INFO, None);
    let _ = recorder.register_counter(&key, &metadata);

    let config_file_path = config_file.to_string_lossy().to_string();
    let server = tokio::spawn(async move {
        web_ui::start_web_server(
            format!("127.0.0.1:{}", port),
            AppConfig::default(),
            handle,
            config_file_path,
        )
        .await
        .unwrap();
    });
    sleep(Duration::from_millis(200)).await;

    let response = http_get(port, "/metrics").await;
    assert!(response.contains("200 OK"));
    assert!(response.contains("# TYPE test_metric counter"));

    server.abort();
    stop_all_routes().await;
    let _ = std::fs::remove_file(config_file);
}
