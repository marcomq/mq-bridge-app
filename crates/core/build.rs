fn main() {
    if std::env::var("CARGO_FEATURE_IBM_MQ").is_ok() {
        println!("cargo:rerun-if-env-changed=MQ_INSTALLATION_PATH");
        println!("cargo:rerun-if-env-changed=MQ_HOME");

        let mq_home = std::env::var("MQ_INSTALLATION_PATH")
            .or_else(|_| std::env::var("MQ_HOME"))
            .unwrap_or_else(|_| "/opt/mqm".to_string());

        let target_pointer_width =
            std::env::var("CARGO_CFG_TARGET_POINTER_WIDTH").unwrap_or_else(|_| "64".to_string());
        let lib_dir = if target_pointer_width == "64" {
            "lib64"
        } else {
            "lib"
        };
        let lib_path = format!("{}/{}", mq_home, lib_dir);

        println!("cargo:rustc-link-search=native={}", lib_path);
        println!("cargo:rustc-link-arg=-Wl,-rpath,{}", lib_path);
    }
}
