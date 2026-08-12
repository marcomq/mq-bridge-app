use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::mpsc;
use std::time::Duration;

fn cli() -> Command {
    Command::new(env!("CARGO_BIN_EXE_mq-bridge-app"))
}

fn copy(from: &str, to: &str) -> Output {
    cli()
        .args(["copy", "--from", from, "--to", to, "--drain"])
        .output()
        .expect("run CLI copy")
}

fn assert_success(output: &Output, case: &str) {
    assert!(
        output.status.success(),
        "{case} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("mq-bridge-app-cli-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&path).expect("create test directory");
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn raw_file_uri(dir: &TestDir, name: &str, payload: &[u8]) -> String {
    let path = dir.path().join(name);
    std::fs::write(&path, payload).expect("seed finite file source");
    format!("file://{}?format=raw", path.display())
}

fn read_raw_output(path: impl AsRef<Path>) -> Vec<u8> {
    let mut payload = std::fs::read(path).expect("read raw file output");
    if payload.last() == Some(&b'\n') {
        payload.pop();
    }
    payload
}

#[test]
fn copy_sends_file_payload_to_configured_http_method_and_path() {
    let dir = TestDir::new();
    let source = raw_file_uri(&dir, "http-source.txt", b"hello-from-cli");
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind HTTP fixture");
    let address = listener.local_addr().expect("fixture address");
    let (request_tx, request_rx) = mpsc::channel();

    let fixture = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept CLI request");
        stream
            .set_read_timeout(Some(Duration::from_secs(10)))
            .expect("set fixture timeout");

        let mut request = Vec::new();
        let mut buffer = [0_u8; 4096];
        loop {
            let read = stream.read(&mut buffer).expect("read CLI request");
            request.extend_from_slice(&buffer[..read]);
            let header_end = request.windows(4).position(|bytes| bytes == b"\r\n\r\n");
            if let Some(header_end) = header_end {
                let headers = String::from_utf8_lossy(&request[..header_end]);
                let content_length = headers
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().expect("content length"))
                    })
                    .unwrap_or_default();
                if request.len() >= header_end + 4 + content_length {
                    break;
                }
            }
            assert_ne!(read, 0, "client closed before sending the full request");
        }

        stream
            .write_all(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .expect("write fixture response");
        request_tx.send(request).expect("return captured request");
    });

    let output = copy(&source, &format!("http://{address}/ingest?method=PUT"));

    assert_success(&output, "HTTP endpoint copy");
    fixture.join().expect("join HTTP fixture");

    let request = String::from_utf8(request_rx.recv().expect("captured request"))
        .expect("HTTP request is UTF-8");
    assert!(request.starts_with("PUT /ingest HTTP/1.1\r\n"), "{request}");
    assert!(request.ends_with("\r\n\r\nhello-from-cli"), "{request}");
}

#[test]
fn copy_round_trips_payload_through_compression_middleware() {
    let dir = TestDir::new();
    let source = raw_file_uri(&dir, "compression-source.txt", b"middleware-round-trip");
    let compressed = dir.path().join("compressed.messages");
    let restored = dir.path().join("restored.txt");
    let compressed_uri = format!(
        "file://{}?format=normal|compression?algorithm=gzip",
        compressed.display()
    );

    let write = copy(&source, &compressed_uri);
    assert_success(&write, "compression copy");

    let restored_uri = format!("file://{}?format=raw", restored.display());
    let read = copy(&compressed_uri, &restored_uri);
    assert_success(&read, "decompression copy");

    assert_eq!(read_raw_output(&restored), b"middleware-round-trip");
}

#[test]
fn middleware_pass_through_matrix_runs_through_the_cli() {
    struct Case {
        name: &'static str,
        input_middleware: &'static str,
        output_middleware: &'static str,
    }

    // Transform, compression, and encryption have dedicated behavioral tests.
    // The cases here verify that the remaining middleware implementations are
    // constructed by the CLI and participate in a real route, not merely parsed.
    let cases = [
        Case {
            name: "metrics",
            input_middleware: "",
            output_middleware: "|metrics",
        },
        Case {
            name: "retry",
            input_middleware: "",
            output_middleware: "|retry?max_attempts=2&initial_interval_ms=1&max_interval_ms=2",
        },
        Case {
            name: "random_panic_disabled",
            input_middleware: "",
            output_middleware: "|random_panic?enabled=false",
        },
        Case {
            name: "delay",
            input_middleware: "",
            output_middleware: "|delay?delay_ms=1",
        },
        Case {
            name: "limiter",
            input_middleware: "",
            output_middleware: "|limiter?messages_per_second=100000",
        },
        Case {
            name: "buffer",
            input_middleware: "",
            output_middleware: "|buffer?max_messages=1&max_delay_ms=1",
        },
        Case {
            name: "cookie_jar",
            input_middleware: "",
            output_middleware: "|cookie_jar",
        },
        Case {
            name: "dlq",
            input_middleware: "",
            output_middleware: "|dlq?endpoint=null%3A",
        },
    ];

    let dir = TestDir::new();
    for case in cases {
        let source = raw_file_uri(
            &dir,
            &format!("{}-source.txt", case.name),
            case.name.as_bytes(),
        );
        let output_path = dir.path().join(format!("{}.txt", case.name));
        let from = format!("{}{}", source, case.input_middleware);
        let to = format!(
            "file://{}?format=raw{}",
            output_path.display(),
            case.output_middleware
        );

        let result = copy(&from, &to);
        assert_success(&result, case.name);
        let output = read_raw_output(&output_path);
        assert_eq!(
            output,
            case.name.as_bytes(),
            "{} changed the payload",
            case.name
        );
    }

    let dedup_source = raw_file_uri(&dir, "deduplication-source.txt", b"deduplication");
    let dedup_output = dir.path().join("deduplication.txt");
    let dedup_store = dir.path().join("deduplication.sled");
    let from = format!(
        "{}|deduplication?ttl_seconds=60&sled_path={}",
        dedup_source,
        dedup_store.display()
    );
    let to = format!("file://{}?format=raw", dedup_output.display());
    let result = copy(&from, &to);
    assert_success(&result, "deduplication");
    assert_eq!(read_raw_output(dedup_output), b"deduplication");

    let weak_join_source = dir.path().join("weak-join-source.messages");
    std::fs::write(
        &weak_join_source,
        br#"{"message_id":"00000000-0000-0000-0000-000000000001","payload":"weak-join","metadata":{"correlation_id":"group"}}
"#,
    )
    .expect("seed weak-join source");
    let weak_join_output = dir.path().join("weak-join.txt");
    let from = format!(
        "file://{}?format=normal|weak_join?group_by=correlation_id&expected_count=1&timeout_ms=100",
        weak_join_source.display()
    );
    let to = format!("file://{}?format=raw", weak_join_output.display());
    let result = copy(&from, &to);
    assert_success(&result, "weak_join");
    assert!(!read_raw_output(weak_join_output).is_empty());
}

#[test]
fn copy_round_trips_payload_through_encryption_middleware() {
    const KEY: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    let dir = TestDir::new();
    let source = raw_file_uri(&dir, "encryption-source.txt", b"secret-payload");
    let encrypted = dir.path().join("encrypted.messages");
    let restored = dir.path().join("restored.txt");
    let encrypted_uri = format!(
        "file://{}?format=normal|encryption?key={KEY}",
        encrypted.display()
    );

    let write = copy(&source, &encrypted_uri);
    assert_success(&write, "encryption copy");

    let restored_uri = format!("file://{}?format=raw", restored.display());
    let read = copy(&encrypted_uri, &restored_uri);
    assert_success(&read, "decryption copy");

    assert_eq!(read_raw_output(&restored), b"secret-payload");
    assert!(
        !std::fs::read(&encrypted)
            .expect("read encrypted payload")
            .windows(b"secret-payload".len())
            .any(|window| window == b"secret-payload"),
        "encrypted file leaked the plaintext payload"
    );
}

#[test]
fn transform_middleware_coerces_payload_through_the_cli() {
    let dir = TestDir::new();
    let source = raw_file_uri(&dir, "transform-source.json", br#"{"count":"7"}"#);
    let output_path = dir.path().join("transformed.json");
    let middleware = concat!(
        "|transform?schema=%7B%22type%22%3A%22object%22%2C%22properties%22%3A",
        "%7B%22count%22%3A%7B%22type%22%3A%22integer%22%7D%7D%7D"
    );
    let from = format!("{source}{middleware}");
    let to = format!("file://{}?format=raw", output_path.display());

    let result = copy(&from, &to);
    assert_success(&result, "transform copy");
    assert_eq!(read_raw_output(output_path), br#"{"count":7}"#);
}

#[test]
fn local_endpoint_role_matrix_constructs_and_runs_real_routes() {
    let dir = TestDir::new();
    let source_file = dir.path().join("source.txt");
    std::fs::write(&source_file, b"from-file").expect("seed file source");

    let cases = [
        (
            "static_source_static_sink",
            format!("file://{}?format=raw", source_file.display()),
            "static:?body=unused&raw=true".to_string(),
        ),
        (
            "file_source_memory_sink",
            format!("file://{}?format=raw", source_file.display()),
            "memory://cli-endpoint-matrix?capacity=4".to_string(),
        ),
        (
            "file_source_null_sink",
            format!("file://{}?format=raw", source_file.display()),
            "null:".to_string(),
        ),
        (
            "memory_source_null_sink",
            "memory://empty-cli-endpoint-matrix?capacity=4".to_string(),
            "null:".to_string(),
        ),
    ];

    for (name, from, to) in cases {
        let result = copy(&from, &to);
        assert_success(&result, name);
    }

    // File-as-sink is asserted rather than merely constructed.
    let sink_file = dir.path().join("sink.txt");
    let sink_uri = format!("file://{}?format=raw", sink_file.display());
    let sink_source = raw_file_uri(&dir, "sink-source.txt", b"to-file");
    let result = copy(&sink_source, &sink_uri);
    assert_success(&result, "file sink");
    assert_eq!(read_raw_output(sink_file), b"to-file");
}
