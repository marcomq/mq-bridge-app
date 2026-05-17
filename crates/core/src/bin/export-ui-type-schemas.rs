use mq_bridge_app::{
    config::{AppConfig, ConsumerConfig, PublisherClient},
    ui_app::{ConsumerStatusResponse, PublishRequest, RuntimeStatusResponse, StorageSecurityInfoResponse},
};
use serde_json::json;

fn main() {
    let schemas = json!({
        "AppConfig": schemars::schema_for!(AppConfig),
        "ConsumerConfig": schemars::schema_for!(ConsumerConfig),
        "PublisherClient": schemars::schema_for!(PublisherClient),
        "PublishRequest": schemars::schema_for!(PublishRequest),
        "RuntimeStatusResponse": schemars::schema_for!(RuntimeStatusResponse),
        "ConsumerStatusResponse": schemars::schema_for!(ConsumerStatusResponse),
        "StorageSecurityInfoResponse": schemars::schema_for!(StorageSecurityInfoResponse),
    });

    println!(
        "{}",
        serde_json::to_string_pretty(&schemas).expect("ui type schemas serialize")
    );
}
