use metrics::{Key, Recorder};
use metrics_exporter_prometheus::PrometheusBuilder;
use mq_bridge_app::config::AppConfig;
use mq_bridge_app::web_ui;
use std::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

fn get_free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap().port()
}

#[tokio::test]
async fn test_web_ui_health_check() {
    let port = get_free_port();
    let builder = PrometheusBuilder::new();
    let recorder = builder.build_recorder();
    let handle = recorder.handle();

    // Start server in background
    let server = tokio::spawn(async move {
        web_ui::start_web_server(
            format!("127.0.0.1:{}", port),
            AppConfig::default(),
            handle,
            "config.yml".to_string(),
        )
        .await
        .unwrap();
    });

    // Give it a moment to start
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port))
        .await
        .unwrap();
    stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();

    let mut buffer = Vec::new();
    stream.read_to_end(&mut buffer).await.unwrap();
    let response = String::from_utf8_lossy(&buffer);

    assert!(response.contains("200 OK"));
    assert!(response.contains("OK"));

    server.abort();
}

#[tokio::test]
async fn test_web_ui_schema_and_index() {
    let port = get_free_port();
    let builder = PrometheusBuilder::new();
    let recorder = builder.build_recorder();
    let handle = recorder.handle();

    // Start server in background
    let server = tokio::spawn(async move {
        web_ui::start_web_server(
            format!("127.0.0.1:{}", port),
            AppConfig::default(),
            handle,
            "config.yml".to_string(),
        )
        .await
        .unwrap();
    });

    // Give it a moment to start
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    // Test Schema
    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port))
        .await
        .unwrap();
    stream
        .write_all(b"GET /schema.json HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    let mut buffer = Vec::new();
    stream.read_to_end(&mut buffer).await.unwrap();
    let response = String::from_utf8_lossy(&buffer);
    assert!(response.contains("200 OK"));
    assert!(response.contains("AppConfig")); // Basic check for schema content

    // Test JS Lib
    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port))
        .await
        .unwrap();
    stream.write_all(b"GET /vanilla-schema-forms.js HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").await.unwrap();
    let mut buffer = Vec::new();
    stream.read_to_end(&mut buffer).await.unwrap();
    let response = String::from_utf8_lossy(&buffer);
    assert!(response.contains("200 OK"));
    assert!(response.contains("VanillaSchemaForm")); // Basic check for JS content

    // Test Index
    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port))
        .await
        .unwrap();
    stream
        .write_all(b"GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    let mut buffer = Vec::new();
    stream.read_to_end(&mut buffer).await.unwrap();
    let response = String::from_utf8_lossy(&buffer);
    assert!(response.contains("200 OK"));
    assert!(response.contains("<script src=\"/vanilla-schema-forms.js\"></script>"));

    server.abort();
}

#[tokio::test]
async fn test_web_ui_post_config() {
    let port = get_free_port();
    let builder = PrometheusBuilder::new();
    let recorder = builder.build_recorder();
    let handle = recorder.handle();

    // Use a temp file for config to avoid overwriting actual config.yml
    let temp_dir = std::env::temp_dir();
    let config_file = temp_dir.join(format!("config_test_{}.yml", port));
    std::env::set_var("CONFIG_FILE", config_file.to_str().unwrap());
    let config_file_path = config_file.to_str().unwrap().to_string();

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

    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let json_payload = r#"{"log_level":"debug","logger":"plain","routes":{"test_route":{"input":{"memory":{"topic":"in"}},"output":{"memory":{"topic":"out"}}}}}"#;
    let request = format!(
        "POST /config HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        json_payload.len(),
        json_payload
    );

    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port))
        .await
        .unwrap();
    stream.write_all(request.as_bytes()).await.unwrap();

    // Verify response
    let mut buffer = Vec::new();
    stream.read_to_end(&mut buffer).await.unwrap();
    let response = String::from_utf8_lossy(&buffer);
    assert!(response.contains("200 OK"));

    // Verify route started
    let routes = mq_bridge_app::mq_bridge::list_routes();
    assert!(routes.contains(&"test_route".to_string()));

    // Cleanup
    let _ = std::fs::remove_file(config_file);
    server.abort();
}

#[tokio::test]
async fn test_web_ui_metrics_endpoint() {
    let port = get_free_port();
    let builder = PrometheusBuilder::new();
    let recorder = builder.build_recorder();
    let handle = recorder.handle();

    // Register a metric to ensure output is not empty and contains HELP
    let key = Key::from_name("test_metric");
    let metadata = metrics::Metadata::new("test_metric", metrics::Level::INFO, None);
    let _ = recorder.register_counter(&key, &metadata);

    // It's fine to not set a global recorder for this test.
    // We just want to check if the endpoint is there.

    // Start server in background
    let server = tokio::spawn(async move {
        web_ui::start_web_server(
            format!("127.0.0.1:{}", port),
            AppConfig::default(),
            handle,
            "config.yml".to_string(),
        )
        .await
        .unwrap();
    });

    // Give it a moment to start
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port))
        .await
        .unwrap();
    stream
        .write_all(b"GET /metrics HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();

    let mut buffer = Vec::new();
    stream.read_to_end(&mut buffer).await.unwrap();
    let response = String::from_utf8_lossy(&buffer);

    assert!(response.contains("200 OK"));
    assert!(response.contains("# TYPE test_metric counter"));

    server.abort();
}
