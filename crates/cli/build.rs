use std::env;
use std::process::Command;

fn main() {
    emit_build_metadata();

    if env::var("CARGO_FEATURE_IBM_MQ").is_err() {
        return;
    }

    println!("cargo:rerun-if-env-changed=MQ_INSTALLATION_PATH");
    println!("cargo:rerun-if-env-changed=MQ_HOME");

    let mq_home = env::var("MQ_INSTALLATION_PATH")
        .or_else(|_| env::var("MQ_HOME"))
        .unwrap_or_else(|_| "/opt/mqm".to_string());

    let target_pointer_width =
        env::var("CARGO_CFG_TARGET_POINTER_WIDTH").unwrap_or_else(|_| "64".to_string());
    let lib_dir = if target_pointer_width == "64" {
        "lib64"
    } else {
        "lib"
    };
    let lib_path = format!("{}/{}", mq_home, lib_dir);

    println!("cargo:rustc-link-search=native={}", lib_path);

    if env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("gnu") {
        println!("cargo:rustc-link-arg=-Wl,-rpath,{}", lib_path);
    }

    // On macOS no rpath is embedded by default, so the app can't find the IBM MQ
    // client dylib at runtime unless the user sets DYLD_LIBRARY_PATH manually.
    // Embed the installation lib dir as an rpath so it loads out of the box.
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-Wl,-rpath,{}", lib_path);
    }
}

/// Capture build identity (git commit, profile, timestamp) into compile-time
/// env vars so the binary can report exactly which build is running. All
/// best-effort: a source tarball without git still builds, reporting "unknown".
fn emit_build_metadata() {
    let git_output = |args: &[&str]| {
        Command::new("git")
            .args(args)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    };

    let hash =
        git_output(&["rev-parse", "--short", "HEAD"]).unwrap_or_else(|| "unknown".to_string());
    let dirty = git_output(&["status", "--porcelain"]).is_some_and(|s| !s.is_empty());
    let git = if dirty { format!("{hash}-dirty") } else { hash };
    println!("cargo:rustc-env=MQB_GIT_HASH={git}");

    let profile = env::var("PROFILE").unwrap_or_else(|_| "unknown".to_string());
    println!("cargo:rustc-env=MQB_BUILD_PROFILE={profile}");

    let build_time = Command::new("date")
        .args(["-u", "+%Y-%m-%dT%H:%M:%SZ"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=MQB_BUILD_TIME={build_time}");
}
