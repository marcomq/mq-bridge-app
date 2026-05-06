fn main() {
    // Read the current crate version from Cargo.toml
    let cargo_version = env!("CARGO_PKG_VERSION");
    let config_path = "tauri.conf.json";

    // Synchronize the version to tauri.conf.json if it differs
    if let Ok(content) = std::fs::read_to_string(config_path) {
        if let Ok(mut config) = serde_json::from_str::<serde_json::Value>(&content) {
            if config["version"].as_str().unwrap() != cargo_version {
                config["version"] = serde_json::Value::String(cargo_version.to_string());
                let updated_content = serde_json::to_string_pretty(&config)
                    .expect("Failed to format tauri.conf.json");
                std::fs::write(config_path, updated_content)
                    .expect("Failed to write tauri.conf.json");
                // Optional: tell cargo to rerun if the config is manually changed
                println!("cargo:rerun-if-changed={}", config_path);
            }
        }
    }

    tauri_build::build()
}
