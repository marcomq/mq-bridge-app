fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cargo_version = env!("CARGO_PKG_VERSION");
    let config_path = "tauri.conf.json";

    println!("cargo:rerun-if-changed={config_path}");

    let content = std::fs::read_to_string(config_path)
        .map_err(|error| format!("Failed to read {config_path}: {error}"))?;
    let mut config = serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|error| format!("Failed to parse {config_path}: {error}"))?;

    match config["version"].as_str() {
        Some(current_version) if current_version != cargo_version => {
            config["version"] = serde_json::Value::String(cargo_version.to_string());
            let updated_content = serde_json::to_string_pretty(&config)
                .map_err(|error| format!("Failed to format {config_path}: {error}"))?;
            std::fs::write(config_path, updated_content)
                .map_err(|error| format!("Failed to write {config_path}: {error}"))?;
        }
        Some(_) => {}
        None => {
            return Err(format!("Missing string version field in {config_path}").into());
        }
    }

    tauri_build::build();
    Ok(())
}
