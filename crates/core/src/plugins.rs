//! Loading native mq-bridge endpoint plugins named by the config or the CLI.
//!
//! A plugin is a shared library holding an endpoint (and optionally a
//! middleware) that was never compiled into this app — Pulsar, a proprietary
//! broker, an in-house transport. Loading it registers the endpoint under its
//! own name, after which routes use it like any built-in one:
//!
//! ```yaml
//! plugins:
//!   - "${MQB_PLUGIN_DIR}/libmq_bridge_pulsar.so"
//!
//! routes:
//!   orders:
//!     input:
//!       custom:
//!         name: pulsar
//!         config: { url: "pulsar://localhost:6650" }
//! ```
//!
//! Every build can load plugins; no cargo feature is involved. Paths go through
//! the usual config placeholder expansion, so `${VAR}` works.
//!
//! Plugins must be loaded **before** any route is built, or the endpoint name is
//! not yet registered and route startup fails with a confusing "unknown
//! endpoint" error. Adding one to `plugins:` and saving takes effect without a
//! restart. Removing one does not: a loaded library stays registered for the
//! life of the process, so dropping a plugin needs a restart.
//!
//! A plugin is native code with the same privileges as this process. Treat the
//! libraries you list like any other native dependency.

use anyhow::Context;

/// Loads every plugin in `paths`, returning the endpoint names registered.
///
/// Loading the same library twice is a no-op, so this is safe to call again
/// whenever the config is re-applied.
///
/// A path that fails to load is fatal: continuing would only fail later, when a
/// route asks for an endpoint nobody registered.
pub fn load_plugins(paths: &[String]) -> anyhow::Result<Vec<String>> {
    let mut names = Vec::with_capacity(paths.len());
    for path in paths {
        let path = path.trim();
        if path.is_empty() {
            continue;
        }
        let info = mq_bridge::plugin::load_endpoint_plugin(path)
            .with_context(|| format!("failed to load plugin `{path}`"))?;
        names.push(info.name);
    }
    Ok(names)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_list_loads_nothing() {
        assert!(load_plugins(&[]).unwrap().is_empty());
        assert!(load_plugins(&["  ".to_string()]).unwrap().is_empty());
    }

    #[test]
    fn a_bad_path_names_the_plugin_in_the_error() {
        let error = load_plugins(&["/nonexistent/libnope.so".to_string()]).unwrap_err();
        assert!(
            format!("{error:#}").contains("/nonexistent/libnope.so"),
            "{error:#}"
        );
    }
}
