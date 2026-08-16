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
    copy_with_options(from, to, &[])
}

fn copy_with_options(from: &str, to: &str, options: &[&str]) -> Output {
    let mut command = cli();
    command.args(["copy", "--from", from, "--to", to, "--drain"]);
    command.args(options);
    command.output().expect("run CLI copy")
}

fn copy_positional(from: &str, to: &str, options: &[&str]) -> Output {
    let mut command = cli();
    command.args(["copy", from, to, "--drain"]);
    command.args(options);
    command.output().expect("run positional CLI copy")
}

fn assert_success(output: &Output, case: &str) {
    assert!(
        output.status.success(),
        "{case} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn assert_failure_contains(output: &Output, case: &str, expected: &str) {
    assert!(!output.status.success(), "{case} unexpectedly succeeded");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains(expected),
        "{case} did not report {expected:?}: {stderr}"
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
fn compression_middleware_algorithm_matrix_round_trips_payload() {
    let dir = TestDir::new();
    for algorithm in ["gzip", "lz4", "zstd"] {
        let payload = format!("middleware-{algorithm}-round-trip");
        let source = raw_file_uri(&dir, &format!("{algorithm}-source.txt"), payload.as_bytes());
        let compressed = dir.path().join(format!("{algorithm}.messages"));
        let restored = dir.path().join(format!("{algorithm}-restored.txt"));
        let compressed_uri = format!(
            "file://{}?format=normal|compression?algorithm={algorithm}",
            compressed.display()
        );

        let write = copy(&source, &compressed_uri);
        assert_success(&write, &format!("{algorithm} compression"));

        let restored_uri = format!("file://{}?format=raw", restored.display());
        let read = copy(&compressed_uri, &restored_uri);
        assert_success(&read, &format!("{algorithm} decompression"));
        assert_eq!(
            read_raw_output(&restored),
            payload.as_bytes(),
            "{algorithm}"
        );
    }
}

#[test]
fn file_format_matrix_round_trips_json_payload() {
    let dir = TestDir::new();
    let expected = serde_json::json!({"city": "Berlin", "name": "Ada"});

    for format in ["normal", "json", "text", "raw", "csv"] {
        let source = raw_file_uri(
            &dir,
            &format!("{format}-source.json"),
            br#"{"city":"Berlin","name":"Ada"}"#,
        );
        let encoded = dir.path().join(format!("{format}.messages"));
        let restored = dir.path().join(format!("{format}-restored.json"));
        let encoded_uri = format!("file://{}?format={format}", encoded.display());

        let write = copy(&source, &encoded_uri);
        assert_success(&write, &format!("{format} file write"));

        let restored_uri = format!("file://{}?format=raw", restored.display());
        let read = copy(&encoded_uri, &restored_uri);
        assert_success(&read, &format!("{format} file read"));
        let actual: serde_json::Value = serde_json::from_slice(&read_raw_output(&restored))
            .unwrap_or_else(|error| panic!("{format} output was not JSON: {error}"));
        assert_eq!(actual, expected, "{format}");
    }
}

#[test]
fn file_at_rest_configuration_matrix_round_trips_payload() {
    const KEY: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    struct Case {
        name: String,
        compression: &'static str,
        cipher: Option<&'static str>,
    }

    let mut cases = Vec::new();
    for compression in ["none", "gzip", "lz4", "zstd"] {
        for cipher in [None, Some("xchacha20poly1305"), Some("aes256gcm")] {
            cases.push(Case {
                name: format!("{compression}-{}", cipher.unwrap_or("plain")),
                compression,
                cipher,
            });
        }
    }

    let dir = TestDir::new();
    for case in cases {
        let payload = format!("at-rest-{}", case.name);
        let source = raw_file_uri(
            &dir,
            &format!("{}-source.txt", case.name),
            payload.as_bytes(),
        );
        let stored = dir.path().join(format!("{}.messages", case.name));
        let restored = dir.path().join(format!("{}-restored.txt", case.name));
        let encryption = case.cipher.map_or_else(String::new, |cipher| {
            format!("&encryption=%7B%22cipher%22%3A%22{cipher}%22%2C%22key%22%3A%22{KEY}%22%7D")
        });
        let stored_uri = format!(
            "file://{}?format=normal&compression={}{}",
            stored.display(),
            case.compression,
            encryption
        );

        let write = copy(&source, &stored_uri);
        assert_success(&write, &format!("{} at-rest write", case.name));
        if case.cipher.is_some() {
            assert!(
                !std::fs::read(&stored)
                    .expect("read encrypted at-rest payload")
                    .windows(payload.len())
                    .any(|window| window == payload.as_bytes()),
                "{} leaked plaintext",
                case.name
            );
        }

        let restored_uri = format!("file://{}?format=raw", restored.display());
        let read = copy(&stored_uri, &restored_uri);
        assert_success(&read, &format!("{} at-rest read", case.name));
        assert_eq!(
            read_raw_output(&restored),
            payload.as_bytes(),
            "{}",
            case.name
        );
    }
}

#[test]
fn compression_and_encryption_middleware_composition_matrix_round_trips_payload() {
    const KEY: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    let dir = TestDir::new();

    for algorithm in ["gzip", "lz4", "zstd"] {
        for cipher in ["xchacha20poly1305", "aes256gcm"] {
            let name = format!("{algorithm}-{cipher}");
            let payload = format!("composed-{name}");
            let source = raw_file_uri(&dir, &format!("{name}-source.txt"), payload.as_bytes());
            let stored = dir.path().join(format!("{name}.messages"));
            let restored = dir.path().join(format!("{name}-restored.txt"));
            let stored_base = format!("file://{}?format=normal", stored.display());
            let write_uri = format!(
                "{stored_base}|compression?algorithm={algorithm}|encryption?cipher={cipher}&key={KEY}"
            );

            let write = copy(&source, &write_uri);
            assert_success(&write, &format!("{name} composed write"));
            assert!(
                !std::fs::read(&stored)
                    .expect("read composed encrypted payload")
                    .windows(payload.len())
                    .any(|window| window == payload.as_bytes()),
                "{name} leaked plaintext"
            );

            // Endpoint middleware order must be inverted when reading the stored payload.
            let read_uri = format!(
                "{stored_base}|encryption?cipher={cipher}&key={KEY}|compression?algorithm={algorithm}"
            );
            let restored_uri = format!("file://{}?format=raw", restored.display());
            let read = copy(&read_uri, &restored_uri);
            assert_success(&read, &format!("{name} composed read"));
            assert_eq!(read_raw_output(&restored), payload.as_bytes(), "{name}");
        }
    }
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
fn transform_middleware_configuration_matrix_changes_payloads_through_the_cli() {
    let dir = TestDir::new();

    let cases = [
        (
            "integer",
            br#"{"value":"7"}"#.as_slice(),
            "%7B%22type%22%3A%22object%22%2C%22properties%22%3A%7B%22value%22%3A%7B%22type%22%3A%22integer%22%7D%7D%7D",
            serde_json::json!({"value": 7}),
        ),
        (
            "boolean",
            br#"{"value":"true"}"#.as_slice(),
            "%7B%22type%22%3A%22object%22%2C%22properties%22%3A%7B%22value%22%3A%7B%22type%22%3A%22boolean%22%7D%7D%7D",
            serde_json::json!({"value": true}),
        ),
        (
            "number",
            br#"{"value":"2.5"}"#.as_slice(),
            "%7B%22type%22%3A%22object%22%2C%22properties%22%3A%7B%22value%22%3A%7B%22type%22%3A%22number%22%7D%7D%7D",
            serde_json::json!({"value": 2.5}),
        ),
    ];

    for (name, payload, schema, expected) in cases {
        let source = raw_file_uri(&dir, &format!("transform-{name}.json"), payload);
        let output_path = dir.path().join(format!("transformed-{name}.json"));
        let from = format!("{source}|transform?schema={schema}");
        let to = format!("file://{}?format=raw", output_path.display());

        let result = copy(&from, &to);
        assert_success(&result, &format!("{name} transform"));
        let actual: serde_json::Value = serde_json::from_slice(&read_raw_output(output_path))
            .unwrap_or_else(|error| panic!("{name} transform output was not JSON: {error}"));
        assert_eq!(actual, expected, "{name}");
    }

    let csv_source = dir.path().join("transform-source.csv");
    std::fs::write(&csv_source, b"id,active,name\n7,true,Ada\n").expect("seed CSV source");
    let csv_schema = concat!(
        "%7B%22type%22%3A%22object%22%2C%22properties%22%3A",
        "%7B%22id%22%3A%7B%22type%22%3A%22integer%22%7D%2C",
        "%22active%22%3A%7B%22type%22%3A%22boolean%22%7D%7D%7D"
    );
    let from = format!(
        "file://{}?format=csv|transform?schema={csv_schema}",
        csv_source.display()
    );
    let output_path = dir.path().join("csv-transformed.json");
    let to = format!("file://{}?format=raw", output_path.display());
    let result = copy(&from, &to);
    assert_success(&result, "CSV plus transform");
    let actual: serde_json::Value = serde_json::from_slice(&read_raw_output(output_path))
        .expect("CSV transform output is JSON");
    assert_eq!(
        actual,
        serde_json::json!({"active": true, "id": 7, "name": "Ada"})
    );
}

#[test]
fn copy_filter_keeps_matching_json_and_drops_non_matching_json() {
    let dir = TestDir::new();
    let source = raw_file_uri(
        &dir,
        "filter-source.jsonl",
        br#"{"amount":25,"status":"new"}
{"amount":125,"status":"paid"}
"#,
    );
    let output_path = dir.path().join("filtered.jsonl");
    let destination = format!("file://{}?format=raw", output_path.display());

    let result = copy_with_options(&source, &destination, &["--filter", "amount > 100"]);
    assert_success(&result, "copy filter");
    let rows = String::from_utf8(read_raw_output(output_path)).expect("filtered output is UTF-8");
    assert_eq!(rows, r#"{"amount":125,"status":"paid"}"#);
}

/// The route-start log names both endpoints, and lands wherever the process's
/// output goes. A password typed on the command line must not travel with it.
#[test]
fn endpoint_passwords_never_reach_the_log() {
    const PASSWORD: &str = "hunter2-should-never-be-logged";

    let dir = TestDir::new();
    let source = raw_file_uri(&dir, "redaction-source.txt", b"payload");
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind HTTP fixture");
    let address = listener.local_addr().expect("fixture address");

    let fixture = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept CLI request");
        stream
            .set_read_timeout(Some(Duration::from_secs(10)))
            .expect("set fixture timeout");
        let mut buffer = [0_u8; 4096];
        let _ = stream.read(&mut buffer);
        let _ = stream.write_all(
            b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        );
    });

    // `--verbose`: the endpoint line only exists above the default `error` level,
    // and it is the line the redaction has to survive.
    let result = copy_with_options(
        &source,
        &format!("http://alice:{PASSWORD}@{address}/ingest"),
        &["--verbose"],
    );
    assert_success(&result, "copy to a password-protected endpoint");
    fixture.join().expect("join HTTP fixture");

    let logged = format!(
        "{}{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(
        !logged.contains(PASSWORD),
        "password reached the log: {logged}"
    );
    assert!(
        logged.contains("alice:***@"),
        "expected a redacted URI: {logged}"
    );
}

/// Credentials belong in the environment, not in `argv` where `/proc` exposes
/// them. A single-quoted URI naming `${VAR}` has to be expanded by the CLI.
#[test]
fn endpoint_uris_expand_environment_variables() {
    let dir = TestDir::new();
    let source = raw_file_uri(&dir, "expansion-source.txt", b"expanded");
    let output_path = dir.path().join("expanded.txt");

    let mut command = cli();
    let result = command
        .args([
            "copy",
            &source,
            &format!(
                "file://{}?format=${{MQ_TEST_FORMAT}}",
                output_path.display()
            ),
            "--drain",
        ])
        .env("MQ_TEST_FORMAT", "raw")
        .output()
        .expect("run CLI copy with an environment variable in the URI");

    assert_success(&result, "URI environment expansion");
    assert_eq!(read_raw_output(output_path), b"expanded");
}

/// A mistyped variable must not be passed through as a literal: sent as a
/// password it would fail later as an authentication error, far from its cause.
#[test]
fn undefined_uri_variables_fail_before_connecting() {
    let dir = TestDir::new();
    let source = raw_file_uri(&dir, "undefined-var-source.txt", b"payload");

    let mut command = cli();
    let result = command
        .args(["copy", &source, "file:///tmp/${MQ_TEST_NOT_SET}", "--drain"])
        .env_remove("MQ_TEST_NOT_SET")
        .output()
        .expect("run CLI copy with an undefined variable");

    assert_failure_contains(&result, "undefined variable", "MQ_TEST_NOT_SET");
}

#[test]
fn copy_filter_on_a_text_typed_source_names_the_numeric_cast() {
    let dir = TestDir::new();
    let source_path = dir.path().join("text-typed.csv");
    std::fs::write(&source_path, b"id,amount\n1,125\n").expect("seed CSV source");

    let result = copy_with_options(
        &format!("file://{}?format=csv", source_path.display()),
        "null:",
        &["--filter", "amount > 100"],
    );

    assert_failure_contains(&result, "text-typed filter", "number(amount)");
}

#[test]
fn copy_filter_reports_invalid_expressions_before_starting() {
    let dir = TestDir::new();
    let source = raw_file_uri(&dir, "invalid-filter.json", br#"{"amount":125}"#);
    let result = copy_with_options(&source, "null:", &["--filter", "("]);
    assert_failure_contains(&result, "invalid filter", "invalid filter expression");
}

#[test]
fn copy_resume_rejects_unsupported_source_before_connecting() {
    let mut command = cli();
    let result = command
        .args([
            "copy",
            "mqtt://localhost:1883/orders",
            "null:",
            "--resume",
            "--drain",
        ])
        .output()
        .expect("run unsupported resume copy");
    assert_failure_contains(
        &result,
        "unsupported resume source",
        "source `mqtt` does not support resumable copy",
    );
}

/// The documented one-line `copy SOURCE TARGET --filter ... --drain` example:
/// a CSV file becomes filtered JSONL, header names becoming JSON keys.
#[test]
fn documented_csv_to_jsonl_filter_one_liner_runs_end_to_end() {
    let dir = TestDir::new();
    let source_path = dir.path().join("orders.csv");
    std::fs::write(
        &source_path,
        b"id,country,amount\n1,DE,25\n2,US,125\n3,US,300\n",
    )
    .expect("seed CSV source");
    let output_path = dir.path().join("orders.jsonl");

    let result = copy_positional(
        &format!("file://{}?format=csv", source_path.display()),
        &format!("file://{}?format=raw", output_path.display()),
        &["--filter", r#"country == "US""#],
    );

    assert_success(&result, "CSV to JSONL one-liner");
    // The summary names both counts: 2 rows reached the destination, but all 3 were
    // read and timed, so the rate must not be charged for the row the filter
    // dropped. Printed to stdout outside the logger, so it survives any log level.
    let report = String::from_utf8_lossy(&result.stdout);
    assert!(
        report.contains("copied 2 of 3 rows"),
        "missing both counts: {report}"
    );
    assert!(report.contains("rows/s"), "missing rate: {report}");

    let rows: Vec<serde_json::Value> = String::from_utf8(read_raw_output(output_path))
        .expect("JSONL output is UTF-8")
        .lines()
        .map(|line| serde_json::from_str(line).expect("each output line is JSON"))
        .collect();
    assert_eq!(
        rows,
        vec![
            serde_json::json!({"id": "2", "country": "US", "amount": "125"}),
            serde_json::json!({"id": "3", "country": "US", "amount": "300"}),
        ]
    );
}

/// A one-shot `copy` answers with one line. The bridge's connection chatter is
/// logged only under `--verbose`, but the summary survives either way because it
/// bypasses the logger entirely.
#[test]
fn the_summary_survives_the_default_error_level_and_verbose_adds_the_chatter() {
    let dir = TestDir::new();
    let source_path = dir.path().join("orders.csv");
    std::fs::write(&source_path, b"id,amount\n1,25\n2,125\n").expect("seed CSV source");
    let source = format!("file://{}?format=csv", source_path.display());

    let quiet = copy_positional(
        &source,
        &format!(
            "file://{}?format=raw",
            dir.path().join("quiet.jsonl").display()
        ),
        &[],
    );
    assert_success(&quiet, "default copy");
    let report = String::from_utf8_lossy(&quiet.stdout).to_string();
    assert!(
        report.contains("copied 2 rows"),
        "the summary must print at the default level: {report}"
    );
    assert!(
        !report.contains("File sink opened") && !report.contains("copy route started"),
        "the default level must drop the connection chatter: {report}"
    );

    let loud = copy_positional(
        &source,
        &format!(
            "file://{}?format=raw",
            dir.path().join("loud.jsonl").display()
        ),
        &["--verbose"],
    );
    assert_success(&loud, "verbose copy");
    let loud_report = String::from_utf8_lossy(&loud.stdout).to_string();
    assert!(
        loud_report.contains("File sink opened") && loud_report.contains("copied 2 rows"),
        "verbose must add the chatter and keep the summary: {loud_report}"
    );
}

#[test]
fn positional_copy_syntax_remains_equivalent_to_named_flags() {
    let dir = TestDir::new();
    let source = raw_file_uri(&dir, "positional-source.txt", b"positional");
    let result = copy_positional(&source, "null:", &[]);
    assert_success(&result, "positional copy");
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

#[test]
fn route_option_matrix_runs_through_the_cli() {
    let dir = TestDir::new();
    let cases: &[(&str, &[&str])] = &[
        ("smallest", &["--batch-size", "1", "--concurrency", "1"]),
        ("uneven", &["--batch-size", "3", "--concurrency", "2"]),
        ("large", &["--batch-size", "2048", "--concurrency", "8"]),
    ];

    for (name, options) in cases {
        let source = raw_file_uri(&dir, &format!("route-options-{name}.txt"), b"route-options");
        let result = copy_with_options(&source, "null:", options);
        assert_success(&result, name);
    }
}

#[test]
fn invalid_cli_configuration_matrix_exits_nonzero_with_context() {
    let dir = TestDir::new();
    let source = raw_file_uri(&dir, "invalid-config-source.txt", b"payload");
    let cases = [
        (
            "unsupported endpoint",
            "unknown://source",
            "null:",
            "unsupported endpoint scheme",
        ),
        (
            "unknown file option",
            &format!("{source}&does_not_exist=true"),
            "null:",
            "unrecognised query param 'does_not_exist'",
        ),
        (
            "unsupported middleware",
            &format!("{source}|does_not_exist"),
            "null:",
            "unsupported middleware 'does_not_exist'",
        ),
        (
            "invalid transform object",
            &format!("{source}|transform?schema=not-json"),
            "null:",
            "expects a JSON literal",
        ),
        (
            "invalid destination",
            &source,
            "file://?format=raw",
            "must include a path",
        ),
    ];

    for (name, from, to, expected) in cases {
        let result = copy(from, to);
        assert_failure_contains(&result, name, expected);
    }

    let missing_to = cli()
        .args(["copy", "--from", "null:", "--drain"])
        .output()
        .expect("run CLI with missing --to");
    assert_failure_contains(&missing_to, "missing --to", "--to");
}
