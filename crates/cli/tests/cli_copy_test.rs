use std::collections::BTreeMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::mpsc;
use std::time::{Duration, Instant};

fn cli() -> Command {
    Command::new(env!("CARGO_BIN_EXE_mq-bridge-app"))
}

fn copy(from: &str, to: &str) -> Output {
    copy_with_options(from, to, &[])
}

/// Accepts one connection, giving up after `timeout` rather than parking the
/// fixture thread forever when the CLI never connects — an unbounded `accept`
/// turns that failure into a hung test run instead of a failed assertion.
///
/// The bound only has to beat a genuine hang, so it is far longer than the
/// connect takes in practice: a debug-built CLI on a loaded machine can spend
/// tens of seconds getting to its first connection, and a deadline near that
/// figure just trades a hang for a flake.
fn accept_within(listener: &TcpListener, timeout: Duration) -> TcpStream {
    listener
        .set_nonblocking(true)
        .expect("set fixture non-blocking");
    let deadline = Instant::now() + timeout;
    loop {
        match listener.accept() {
            Ok((stream, _)) => {
                stream
                    .set_nonblocking(false)
                    .expect("restore blocking stream");
                return stream;
            }
            Err(error) if error.kind() == ErrorKind::WouldBlock => {
                assert!(
                    Instant::now() < deadline,
                    "the CLI never connected to the fixture within {timeout:?}"
                );
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(error) => panic!("accept CLI request: {error}"),
        }
    }
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

/// The rows a `format=raw` destination holds, one per line.
///
/// Returns empty rather than failing for a file that does not exist yet: the
/// continuous tests poll this while the copy is still running.
fn read_rows(path: impl AsRef<Path>) -> Vec<String> {
    std::fs::read_to_string(path)
        .map(|body| body.lines().map(str::to_string).collect())
        .unwrap_or_default()
}

/// `count` distinct JSON rows, so a dropped, duplicated, or reordered row is
/// visible in the assertion rather than hidden behind identical payloads.
fn numbered_rows(count: usize) -> Vec<String> {
    (0..count)
        .map(|index| {
            format!(
                r#"{{"id":{index},"name":"row-{index}","amount":{}}}"#,
                index * 10
            )
        })
        .collect()
}

fn seed_rows(dir: &TestDir, name: &str, rows: &[String]) -> PathBuf {
    let path = dir.path().join(name);
    let mut body = rows.join("\n");
    if !body.is_empty() {
        body.push('\n');
    }
    std::fs::write(&path, body).expect("seed row source");
    path
}

fn raw_uri(path: impl AsRef<Path>) -> String {
    format!("file://{}?format=raw", path.as_ref().display())
}

/// Blocks until `ready` holds, so a test synchronises on the copy's own progress
/// instead of on a sleep long enough to be slow and short enough to be flaky.
fn wait_until(what: &str, mut ready: impl FnMut() -> bool) {
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    while std::time::Instant::now() < deadline {
        if ready() {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    panic!("timed out waiting for {what}");
}

/// Compares bulk rows, reporting the first difference and the count rather than
/// dumping hundreds of rows into the panic message.
///
/// Order-sensitive: a route writes concurrently by default, so only a copy that
/// pinned `--concurrency 1` may compare rows in order. Everything else sorts
/// both sides first — see [`sorted`].
fn assert_rows_eq<T: PartialEq + std::fmt::Debug>(actual: &[T], expected: &[T], case: &str) {
    if let Some((index, (copied, wanted))) = actual
        .iter()
        .zip(expected)
        .enumerate()
        .find(|(_, (copied, wanted))| copied != wanted)
    {
        panic!("{case}: row {index} differs\n  copied:   {copied:?}\n  expected: {wanted:?}");
    }
    assert_eq!(
        actual.len(),
        expected.len(),
        "{case}: copied {} rows, expected {}",
        actual.len(),
        expected.len()
    );
}

/// Rows in a canonical order, for comparing what a concurrent copy delivered.
///
/// Several workers write batches in parallel, so which row lands first is not
/// part of the contract; that every row lands exactly once is.
fn sorted(rows: &[String]) -> Vec<String> {
    let mut sorted = rows.to_vec();
    sorted.sort();
    sorted
}

fn wait_for_rows(path: impl AsRef<Path>, count: usize) {
    let path = path.as_ref();
    wait_until(&format!("{count} rows in {}", path.display()), || {
        read_rows(path).len() >= count
    });
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
        let mut stream = accept_within(&listener, Duration::from_secs(180));
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

    // An inherited `RUST_LOG` outranks the defaults this test is about, so both
    // runs drop it and let `init_copy_logging` pick the level.
    let copy_without_rust_log = |target: &str, options: &[&str]| {
        let mut command = cli();
        command.env_remove("RUST_LOG");
        command.args(["copy", &source, target, "--drain"]);
        command.args(options);
        command.output().expect("run CLI copy")
    };

    let quiet = copy_without_rust_log(
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

    let loud = copy_without_rust_log(
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

/// A target left without a `format` writes `normal`, which wraps each row in an
/// envelope **and** stringifies the payload — so the file holds escaped JSON
/// inside a JSON string rather than the rows. Only `raw` writes the rows as they
/// are, which is what an export to a lake or a downstream reader wants.
///
/// Pinned through the `file` sink deliberately: `ObjectStoreConfig::format` is the
/// same `FileFormat` with the same encoder, so this covers the `s3://` target too
/// without needing a bucket to test against.
#[test]
fn the_target_format_decides_whether_rows_are_wrapped_or_written_as_they_are() {
    let dir = TestDir::new();
    let source_path = dir.path().join("rows.csv");
    std::fs::write(&source_path, b"id,name\n1,ada\n").expect("seed CSV source");
    let source = format!("file://{}?format=csv", source_path.display());

    let written = |name: &str, encoding: &str| -> serde_json::Value {
        let path = dir.path().join(name);
        let target = match encoding {
            "" => format!("file://{}", path.display()),
            other => format!("file://{}?format={other}", path.display()),
        };
        let result = copy_positional(&source, &target, &[]);
        assert_success(&result, &format!("copy to a {encoding:?} target"));
        let body = String::from_utf8(read_raw_output(&path)).expect("output is UTF-8");
        serde_json::from_str(body.lines().next().expect("one row written"))
            .expect("each output line is JSON")
    };

    let row = serde_json::json!({"id": "1", "name": "ada"});

    // The default is `normal`, and both double-encode: `payload` is a *string*.
    for encoding in ["", "normal"] {
        let name = format!(
            "{}.out",
            if encoding.is_empty() {
                "default"
            } else {
                encoding
            }
        );
        let out = written(&name, encoding);
        assert!(
            out["payload"].is_string(),
            "{encoding:?} should stringify the payload: {out}"
        );
        let inner: serde_json::Value = serde_json::from_str(out["payload"].as_str().unwrap())
            .expect("the stringified payload is itself JSON");
        assert_eq!(inner, row, "{encoding:?}");
    }

    // `json` keeps the envelope but nests the payload properly.
    let wrapped = written("json.out", "json");
    assert_eq!(wrapped["payload"], row);
    assert!(wrapped["message_id"].is_string());

    // `raw` writes the row and nothing around it.
    let bare = written("raw.out", "raw");
    assert_eq!(bare, row);
    assert!(
        bare.get("message_id").is_none() && bare.get("payload").is_none(),
        "raw must not wrap the row: {bare}"
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

/// A `copy` left running as a continuous bridge, ended with Ctrl-C the way the
/// `--drain`-less form documents. Its output is redirected to a file rather than
/// a pipe so the test can read the log while the process is still alive.
///
/// Unix only: the interesting part is the graceful SIGINT shutdown, and Windows
/// has no equivalent to send to a child. CI runs the test suite on Linux.
#[cfg(unix)]
struct ContinuousCopy {
    child: std::process::Child,
    log: PathBuf,
}

#[cfg(unix)]
impl ContinuousCopy {
    /// `--concurrency 1`: one writer, so the destination keeps the order the
    /// rows were written to the source in and the assertions can say *when* a
    /// row arrived, not merely that it did.
    fn start(dir: &TestDir, name: &str, from: &str, to: &str) -> Self {
        let log = dir.path().join(format!("{name}.log"));
        let output = std::fs::File::create(&log).expect("create continuous copy log");
        let errors = output.try_clone().expect("clone continuous copy log");
        let child = cli()
            .args(["copy", from, to, "--verbose", "--concurrency", "1"])
            .stdout(output)
            .stderr(errors)
            .spawn()
            .expect("start continuous copy");
        Self { child, log }
    }

    /// Blocks until the source consumer has connected.
    ///
    /// This is what makes "added after start" mean it: a tailing source positions
    /// itself at the end of the file when it connects, so a row appended before
    /// this returns could be read as pre-existing data instead.
    fn wait_until_connected(&self) {
        wait_until("the copy's source consumer to connect", || {
            std::fs::read_to_string(&self.log)
                .is_ok_and(|log| log.contains("File consumer connected"))
        });
    }

    /// Ctrl-C, then waits for the exit the CLI promises for a clean shutdown.
    fn stop(mut self) -> String {
        let pid = self.child.id().to_string();
        let signalled = Command::new("kill")
            .args(["-INT", &pid])
            .status()
            .expect("send SIGINT to the continuous copy");
        assert!(signalled.success(), "could not interrupt copy {pid}");
        let status = self.child.wait().expect("await the interrupted copy");
        let log = std::fs::read_to_string(&self.log).expect("read continuous copy log");
        assert!(status.success(), "interrupted copy exited {status}: {log}");
        log
    }
}

#[cfg(unix)]
impl Drop for ContinuousCopy {
    /// A failed assertion skips `stop`, and the child would otherwise keep
    /// tailing its source after the test binary has moved on.
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Every row has to arrive, in order, through every at-rest configuration — the
/// existing matrix pins one payload per combination, which a batching or
/// framing bug that only loses the tail of a batch would survive.
#[test]
fn every_row_survives_the_at_rest_configuration_matrix() {
    const KEY: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    let dir = TestDir::new();
    let rows = numbered_rows(200);
    let source = raw_uri(seed_rows(&dir, "at-rest-bulk-source.jsonl", &rows));

    for compression in ["none", "gzip", "lz4", "zstd"] {
        for cipher in [None, Some("xchacha20poly1305"), Some("aes256gcm")] {
            let name = format!("{compression}-{}", cipher.unwrap_or("plain"));
            let stored = dir.path().join(format!("{name}-bulk.messages"));
            let restored = dir.path().join(format!("{name}-bulk-restored.jsonl"));
            let encryption = cipher.map_or_else(String::new, |cipher| {
                format!("&encryption=%7B%22cipher%22%3A%22{cipher}%22%2C%22key%22%3A%22{KEY}%22%7D")
            });
            let stored_uri = format!(
                "file://{}?format=normal&compression={compression}{encryption}",
                stored.display()
            );

            let write = copy(&source, &stored_uri);
            assert_success(&write, &format!("{name} bulk write"));
            let read = copy(&stored_uri, &raw_uri(&restored));
            assert_success(&read, &format!("{name} bulk read"));

            assert_rows_eq(&sorted(&read_rows(&restored)), &sorted(&rows), &name);
        }
    }
}

/// The same completeness check across the file formats. `csv` is the one that
/// could plausibly lose rows rather than mangle them: it writes a single header
/// for the whole file, so the row-to-line mapping differs from every other format.
///
/// It is also the one format that does not preserve the values: a CSV cell has
/// no type, so every field comes back as text. That is pinned here rather than
/// worked around — a filter written against a CSV source has to cast, which is
/// what `copy_filter_on_a_text_typed_source_names_the_numeric_cast` reports.
#[test]
fn every_row_survives_the_file_format_matrix() {
    let dir = TestDir::new();
    let rows = numbered_rows(200);
    let source = raw_uri(seed_rows(&dir, "format-bulk-source.jsonl", &rows));

    // Re-encoded through a `BTreeMap` so fields compare by name: CSV rewrites
    // field order to its header's, and `serde_json` preserves insertion order
    // here rather than sorting keys. Rows are sorted for the reason they are
    // everywhere else — a concurrent copy does not promise the order they land in.
    let canonical = |lines: &[String]| -> Vec<String> {
        let mut rows: Vec<String> = lines
            .iter()
            .map(|line| {
                let row: BTreeMap<String, serde_json::Value> =
                    serde_json::from_str(line).expect("each row is a JSON object");
                serde_json::to_string(&row).expect("re-encode a row")
            })
            .collect();
        rows.sort();
        rows
    };
    // What CSV gives back: the same rows with every value as text.
    let stringified: Vec<String> = rows
        .iter()
        .map(|line| {
            let row: BTreeMap<String, serde_json::Value> =
                serde_json::from_str(line).expect("each seeded row is a JSON object");
            let text: BTreeMap<String, String> = row
                .into_iter()
                .map(|(name, value)| match value {
                    serde_json::Value::String(text) => (name, text),
                    other => (name, other.to_string()),
                })
                .collect();
            serde_json::to_string(&text).expect("re-encode a row")
        })
        .collect();

    let typed = canonical(&rows);
    let text_typed = canonical(&stringified);
    for format in ["normal", "json", "text", "raw", "csv"] {
        let encoded = dir.path().join(format!("{format}-bulk.messages"));
        let restored = dir.path().join(format!("{format}-bulk-restored.jsonl"));
        let encoded_uri = format!("file://{}?format={format}", encoded.display());

        let write = copy(&source, &encoded_uri);
        assert_success(&write, &format!("{format} bulk write"));
        let read = copy(&encoded_uri, &raw_uri(&restored));
        assert_success(&read, &format!("{format} bulk read"));

        let expected = if format == "csv" { &text_typed } else { &typed };
        assert_rows_eq(&canonical(&read_rows(&restored)), expected, format);
    }
}

/// Batch size and concurrency are the settings most likely to lose or duplicate
/// a row, and the existing matrix only copies to `null:` — it proves the options
/// are accepted, not that the data survives them.
#[test]
fn the_route_option_matrix_moves_every_row_exactly_once() {
    let dir = TestDir::new();
    let rows = numbered_rows(500);
    let source = raw_uri(seed_rows(&dir, "route-option-bulk.jsonl", &rows));

    let cases: &[(&str, &[&str])] = &[
        ("smallest", &["--batch-size", "1", "--concurrency", "1"]),
        ("uneven", &["--batch-size", "7", "--concurrency", "3"]),
        ("large", &["--batch-size", "2048", "--concurrency", "8"]),
    ];

    for (name, options) in cases {
        let destination = dir.path().join(format!("route-option-{name}.jsonl"));
        let result = copy_with_options(&source, &raw_uri(&destination), options);
        assert_success(&result, name);

        let copied = read_rows(&destination);
        // Compared as a sorted multiset: several concurrent writers may interleave
        // their batches, but none may drop or repeat a row. A single worker has no
        // one to interleave with, so there the source order is also the result.
        if options.ends_with(&["--concurrency", "1"]) {
            assert_rows_eq(&copied, &rows, name);
        } else {
            assert_rows_eq(&sorted(&copied), &sorted(&rows), name);
        }
    }
}

/// Quoting, escapes, empty fields and non-ASCII are where a CSV reader silently
/// corrupts data instead of failing, and the corruption reaches the destination
/// as a plausible-looking row.
#[test]
fn csv_quoting_escapes_and_unicode_survive_the_round_trip() {
    let dir = TestDir::new();
    let source_path = dir.path().join("edge-cases.csv");
    std::fs::write(
        &source_path,
        "id,note,city\n1,\"has, comma\",Berlin\n2,\"say \"\"hi\"\"\",München\n3,,Tokyo\n",
    )
    .expect("seed CSV source");
    let destination = dir.path().join("edge-cases.jsonl");

    let result = copy(
        &format!("file://{}?format=csv", source_path.display()),
        &raw_uri(&destination),
    );
    assert_success(&result, "CSV edge cases");

    let rows: Vec<serde_json::Value> = read_rows(&destination)
        .iter()
        .map(|line| serde_json::from_str(line).expect("each output line is JSON"))
        .collect();
    assert_eq!(
        rows,
        vec![
            serde_json::json!({"id": "1", "note": "has, comma", "city": "Berlin"}),
            serde_json::json!({"id": "2", "note": r#"say "hi""#, "city": "München"}),
            serde_json::json!({"id": "3", "note": "", "city": "Tokyo"}),
        ]
    );
}

/// A drained copy of a source with nothing in it is a successful copy of zero
/// rows, not a failure — a scheduled job that runs more often than data arrives
/// would otherwise alert on every quiet interval.
#[test]
fn an_empty_source_copies_nothing_and_succeeds() {
    let dir = TestDir::new();

    let empty = dir.path().join("empty.jsonl");
    std::fs::write(&empty, b"").expect("seed empty source");
    let header_only = dir.path().join("header-only.csv");
    std::fs::write(&header_only, b"id,name\n").expect("seed header-only CSV source");

    for (name, source) in [
        ("empty file", raw_uri(&empty)),
        (
            "CSV with only a header",
            format!("file://{}?format=csv", header_only.display()),
        ),
    ] {
        let destination = dir.path().join(format!("{name}.out"));
        let result = copy(&source, &raw_uri(&destination));
        assert_success(&result, name);
        assert!(
            String::from_utf8_lossy(&result.stdout).contains("copied 0 rows"),
            "{name} did not report an empty copy: {}",
            String::from_utf8_lossy(&result.stdout)
        );
        assert!(read_rows(&destination).is_empty(), "{name} wrote rows");
    }
}

/// The filter has to keep exactly the matching rows out of a batched read, not
/// merely keep some of them: the retained rows are re-collected per batch, and a
/// row on a batch boundary is where that goes wrong.
#[test]
fn a_filtered_bulk_copy_moves_exactly_the_matching_rows() {
    let dir = TestDir::new();
    let rows = numbered_rows(500);
    let source = raw_uri(seed_rows(&dir, "filter-bulk.jsonl", &rows));
    let destination = dir.path().join("filter-bulk-out.jsonl");

    // `amount` is `id * 10`, so this keeps ids 11..=499.
    let result = copy_with_options(
        &source,
        &raw_uri(&destination),
        &["--filter", "amount > 100", "--batch-size", "7"],
    );
    assert_success(&result, "bulk filter");

    let expected: Vec<String> = rows.iter().skip(11).cloned().collect();
    assert_rows_eq(
        &sorted(&read_rows(&destination)),
        &sorted(&expected),
        "bulk filter",
    );
    let report = String::from_utf8_lossy(&result.stdout);
    assert!(
        report.contains(&format!("copied {} of {} rows", expected.len(), rows.len())),
        "the summary must name both counts: {report}"
    );
}

/// A continuous copy is a bridge, not a batch job: rows written to the source
/// after it started have to reach the destination while it keeps running.
///
/// `group_subscribe` is the mode that reads what is already there *and* then
/// tails, so this covers both halves in one run.
#[cfg(unix)]
#[test]
fn rows_appended_after_the_copy_started_are_copied_too() {
    use std::fs::OpenOptions;

    let dir = TestDir::new();
    let existing = numbered_rows(3);
    let source_path = seed_rows(&dir, "live-source.jsonl", &existing);
    let destination = dir.path().join("live-out.jsonl");

    let copy = ContinuousCopy::start(
        &dir,
        "live",
        &format!(
            "file://{}?format=raw&mode=group_subscribe&group_id=live-copy",
            source_path.display()
        ),
        &raw_uri(&destination),
    );

    // The rows that were already there arrive first; waiting for them is also
    // what proves the bridge is up before anything is appended.
    wait_for_rows(&destination, existing.len());

    let late: Vec<String> = numbered_rows(6).into_iter().skip(3).collect();
    let mut handle = OpenOptions::new()
        .append(true)
        .open(&source_path)
        .expect("append to the live source");
    for row in &late {
        writeln!(handle, "{row}").expect("write a late row");
    }
    handle.flush().expect("flush the late rows");
    drop(handle);

    wait_for_rows(&destination, existing.len() + late.len());
    let log = copy.stop();

    let expected: Vec<String> = existing.iter().chain(&late).cloned().collect();
    assert_eq!(
        read_rows(&destination),
        expected,
        "the rows appended after the copy started did not all arrive"
    );
    assert!(
        log.contains(&format!("stopped after copying {} rows", expected.len())),
        "the shutdown summary must count the late rows: {log}"
    );
}

/// `subscribe` is the other half of the contract: it starts at the end of the
/// file, so it is the mode to point at a log that is already large when only the
/// new entries matter. A copy that replayed the backlog would be a data leak
/// into a downstream that asked for a tail.
#[cfg(unix)]
#[test]
fn a_subscribe_source_copies_only_what_arrives_after_it_started() {
    use std::fs::OpenOptions;

    let dir = TestDir::new();
    let backlog = numbered_rows(3);
    let source_path = seed_rows(&dir, "tail-source.jsonl", &backlog);
    let destination = dir.path().join("tail-out.jsonl");

    let copy = ContinuousCopy::start(
        &dir,
        "tail",
        &format!("file://{}?format=raw&mode=subscribe", source_path.display()),
        &raw_uri(&destination),
    );
    copy.wait_until_connected();

    let late: Vec<String> = numbered_rows(5).into_iter().skip(3).collect();
    let mut handle = OpenOptions::new()
        .append(true)
        .open(&source_path)
        .expect("append to the tailed source");
    for row in &late {
        writeln!(handle, "{row}").expect("write a late row");
    }
    handle.flush().expect("flush the late rows");
    drop(handle);

    wait_for_rows(&destination, late.len());
    copy.stop();

    assert_eq!(
        read_rows(&destination),
        late,
        "a tailing copy must deliver the new rows and only those"
    );
}

/// The checkpoint a `group_subscribe` source keeps has to survive the process:
/// each run picks up where the last one stopped, so a repeatedly scheduled copy
/// moves every row exactly once rather than re-copying the whole file each time.
#[test]
fn a_group_checkpoint_resumes_where_the_previous_run_stopped() {
    use std::fs::OpenOptions;

    let dir = TestDir::new();
    let first = numbered_rows(4);
    let source_path = seed_rows(&dir, "checkpointed.jsonl", &first);
    let destination = dir.path().join("checkpointed-out.jsonl");
    let source = format!(
        "file://{}?format=raw&mode=group_subscribe&group_id=nightly",
        source_path.display()
    );

    // The destination is the same file every run, so it accumulates exactly what
    // each run contributed: the checkpoint is what keeps a row from landing twice.
    // One writer, so the accumulated file is comparable in order.
    let run = |case: &str| -> Output {
        let result = copy_with_options(&source, &raw_uri(&destination), &["--concurrency", "1"]);
        assert_success(&result, case);
        result
    };

    let initial = run("first checkpointed run");
    assert_eq!(read_rows(&destination), first);
    assert!(
        String::from_utf8_lossy(&initial.stdout).contains("copied 4 rows"),
        "the first run must read the whole file"
    );
    assert!(
        dir.path()
            .join("checkpointed.jsonl.nightly.offset")
            .exists(),
        "the run must persist an offset for its group"
    );

    let mut handle = OpenOptions::new()
        .append(true)
        .open(&source_path)
        .expect("append between runs");
    let late: Vec<String> = numbered_rows(6).into_iter().skip(4).collect();
    for row in &late {
        writeln!(handle, "{row}").expect("write a row between runs");
    }
    drop(handle);

    let second = run("second checkpointed run");
    assert!(
        String::from_utf8_lossy(&second.stdout).contains("copied 2 rows"),
        "the second run must read only what was appended: {}",
        String::from_utf8_lossy(&second.stdout)
    );

    let third = run("third checkpointed run");
    assert!(
        String::from_utf8_lossy(&third.stdout).contains("copied 0 rows"),
        "a run with nothing new must copy nothing: {}",
        String::from_utf8_lossy(&third.stdout)
    );

    let expected: Vec<String> = first.iter().chain(&late).cloned().collect();
    assert_eq!(
        read_rows(&destination),
        expected,
        "three runs must have moved each row exactly once"
    );
}

/// Two pipelines reading the same file must not share a position. Sharing one
/// would let whichever ran first hide the rows from the other — a silent, total
/// data loss for the second pipeline rather than an error.
#[test]
fn separate_group_ids_keep_separate_checkpoints() {
    let dir = TestDir::new();
    let rows = numbered_rows(4);
    let source_path = seed_rows(&dir, "shared-source.jsonl", &rows);

    for group in ["reporting", "archive"] {
        let destination = dir.path().join(format!("{group}.jsonl"));
        let result = copy_with_options(
            &format!(
                "file://{}?format=raw&mode=group_subscribe&group_id={group}",
                source_path.display()
            ),
            &raw_uri(&destination),
            &["--concurrency", "1"],
        );
        assert_success(&result, group);
        assert_eq!(read_rows(&destination), rows, "{group} lost rows");
    }
}

/// `--resume` fails before connecting, and the message names the source and why.
///
/// The rejection is the safety property: silently copying from the beginning
/// would duplicate every row into the destination on each run, and silently
/// copying from the end would skip everything written in between.
#[test]
fn resume_rejections_name_the_source_and_the_reason() {
    let dir = TestDir::new();
    let source_path = seed_rows(&dir, "unresumable.jsonl", &numbered_rows(2));
    let sqlite_path = dir.path().join("unresumable.db");
    std::fs::write(&sqlite_path, b"").expect("create an empty SQLite database");

    let cases = [
        (
            "plain file",
            raw_uri(&source_path),
            "source `file` does not support resumable copy",
        ),
        (
            // Offsets exist here, which is exactly why the refusal has to explain
            // itself rather than look like the source was simply not recognised.
            "file with offsets",
            format!(
                "file://{}?format=raw&mode=group_subscribe&group_id=resume",
                source_path.display()
            ),
            "resumable copy is not enabled because its current batch commit is not safe",
        ),
        (
            "SQL without a cursor column",
            format!("sqlite://{}?table=orders", sqlite_path.display()),
            "needs a monotonic `cursor_column` for resumable copy",
        ),
        (
            "MQTT",
            "mqtt://localhost:1883/orders".to_string(),
            "source `mqtt` does not support resumable copy",
        ),
    ];

    for (name, from, expected) in cases {
        let result = copy_with_options(&from, "null:", &["--resume"]);
        assert_failure_contains(&result, name, expected);
    }
}

/// A sink that permanently rejects every message must not produce a successful
/// copy. The route drops those messages and runs to a normal end by design — one
/// poison message must not wedge a bridge — so the drop tally, not the outcome,
/// is what says the rows never arrived.
///
/// Uses a misspelled table name because that is how it shows up in practice: a
/// scheduled `copy` that logged a `Dropping message` line per row, printed
/// `copied 3 rows` and exited 0, having written nothing at all.
#[test]
fn a_copy_whose_sink_dropped_every_row_fails_instead_of_reporting_success() {
    let dir = TestDir::new();
    let source = raw_uri(seed_rows(&dir, "dropped-source.jsonl", &numbered_rows(3)));
    // An empty file is a valid empty SQLite database, so the sink connects and
    // only then finds the table missing — which is the case under test.
    let database = dir.path().join("dropped.db");
    std::fs::write(&database, b"").expect("create an empty SQLite database");

    let result = copy(
        &source,
        &format!("sqlite://{}?table=does_not_exist", database.display()),
    );

    assert_failure_contains(&result, "sink dropped every row", "no such table");
    assert!(
        !String::from_utf8_lossy(&result.stdout).contains("copied 3 rows"),
        "a copy that delivered nothing must not report rows copied: {}",
        String::from_utf8_lossy(&result.stdout)
    );
}

/// Creates the SQLite database and runs `statements` against it.
///
/// The copy CLI can fill a table (`auto_create_table=true`) but the table it
/// defines carries `DATETIME` columns the SQL `Any` driver refuses to decode, so
/// a table meant to be *read* back has to be defined here.
#[cfg(any(feature = "full", feature = "sqlx"))]
// `&'static str`: sqlx only accepts raw SQL it can see is not built at runtime.
fn sqlite_execute(path: &Path, statements: &[&'static str]) {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("build the SQLite test runtime");
    runtime.block_on(async {
        let pool = sqlx::SqlitePool::connect(&format!("sqlite://{}?mode=rwc", path.display()))
            .await
            .expect("open the SQLite test database");
        for statement in statements {
            sqlx::raw_sql(*statement)
                .execute(&pool)
                .await
                .unwrap_or_else(|error| panic!("run `{statement}`: {error}"));
        }
        pool.close().await;
    });
}

/// `--resume` across restarts: each run continues from the cursor the previous
/// one persisted, so a copy scheduled to run repeatedly moves every row exactly
/// once. Without the checkpoint each run would re-read the whole table and the
/// destination would accumulate duplicates.
///
/// Ends by pointing the same source at a second destination, which must not
/// inherit that cursor: the checkpoint identity covers both endpoints, and a
/// shared one would silently deprive the new pipeline of every earlier row.
#[cfg(any(feature = "full", feature = "sqlx"))]
#[test]
fn a_resumable_sql_copy_moves_each_row_exactly_once_across_runs() {
    let dir = TestDir::new();
    let database = dir.path().join("resume.db");
    sqlite_execute(
        &database,
        &[
            "CREATE TABLE orders (id INTEGER PRIMARY KEY, amount INTEGER)",
            "INSERT INTO orders (id, amount) VALUES (1, 10), (2, 20), (3, 30)",
        ],
    );

    // The checkpoint identity is derived from the source, the destination and the
    // filter, so both have to stay identical across runs for one to continue the
    // other.
    let destination = dir.path().join("resumed.jsonl");
    let source = format!(
        "sqlite://{}?table=orders&cursor_column=id",
        database.display()
    );
    let run = |case: &str| -> Output {
        let result = copy_with_options(
            &source,
            &raw_uri(&destination),
            &["--resume", "--concurrency", "1"],
        );
        assert_success(&result, case);
        result
    };

    let first = run("first resumable run");
    assert!(
        String::from_utf8_lossy(&first.stdout).contains("copied 3 rows"),
        "the first run reads the whole table: {}",
        String::from_utf8_lossy(&first.stdout)
    );

    sqlite_execute(
        &database,
        &["INSERT INTO orders (id, amount) VALUES (4, 40), (5, 50)"],
    );

    let second = run("second resumable run");
    assert!(
        String::from_utf8_lossy(&second.stdout).contains("copied 2 rows"),
        "the second run reads only the rows added since: {}",
        String::from_utf8_lossy(&second.stdout)
    );

    let third = run("third resumable run");
    assert!(
        String::from_utf8_lossy(&third.stdout).contains("copied 0 rows"),
        "a caught-up run copies nothing: {}",
        String::from_utf8_lossy(&third.stdout)
    );

    let rows: Vec<serde_json::Value> = read_rows(&destination)
        .iter()
        .map(|line| serde_json::from_str(line).expect("each copied line is JSON"))
        .collect();
    assert_eq!(
        rows,
        (1..=5)
            .map(|id| serde_json::json!({"id": id, "amount": id * 10}))
            .collect::<Vec<_>>(),
        "three runs must have appended each row exactly once"
    );

    // A second destination is a different pipeline, so it must not inherit the
    // cursor above: it starts from the beginning and receives all five rows.
    let archive = dir.path().join("archive.jsonl");
    let forked = copy_with_options(&source, &raw_uri(&archive), &["--resume"]);
    assert_success(&forked, "copy to a second destination");
    assert_eq!(
        read_rows(&archive).len(),
        5,
        "a new destination must start from the beginning, not from the other copy's cursor"
    );
}
