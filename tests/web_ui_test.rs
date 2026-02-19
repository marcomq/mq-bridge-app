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

    // Start server in background
    let server = tokio::spawn(async move {
        web_ui::start_web_server(&format!("127.0.0.1:{}", port), AppConfig::default())
            .unwrap()
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

    // Start server in background
    let server = tokio::spawn(async move {
        web_ui::start_web_server(&format!("127.0.0.1:{}", port), AppConfig::default())
            .unwrap()
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

    let server = tokio::spawn(async move {
        web_ui::start_web_server(&format!("127.0.0.1:{}", port), AppConfig::default())
            .unwrap()
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

    server.abort();
}
