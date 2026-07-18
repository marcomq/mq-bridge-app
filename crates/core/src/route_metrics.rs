//  mq-bridge-app
//  © Copyright 2026, by Marco Mengelkoch
//  Licensed under MIT License, see License file for more details
//  git clone https://github.com/marcomq/mq-bridge-app

//! Per-route message metrics shared by the web UI and the MCP server.
//!
//! Neither a message rate nor a "last N messages" buffer is something a plain
//! [`Route`](mq_bridge::models::Route) reports — both are produced by wrapping the
//! route in a handler that counts every message and, optionally, copies it into a
//! bounded in-process channel. A background sampler turns those counters into a
//! smoothed messages-per-second rate.
//!
//! The web UI does this for every configured consumer and the MCP server does it
//! for the routes it starts, so `throughput` and the captured message shape mean
//! the same thing whichever surface reports them.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use mq_bridge::endpoints::memory::MemoryChannel;
use mq_bridge::models::MemoryConfig;
use mq_bridge::{CanonicalMessage, get_or_create_channel};
use tokio::sync::RwLock;

/// Time constant of the throughput EWMA, in seconds.
/// A value of 0.5s means a burst decays to ~1% of its value in roughly 2-3s.
pub const THROUGHPUT_TAU: f64 = 0.5;

/// Frequency of throughput calculations.
pub const THROUGHPUT_UPDATE_INTERVAL: Duration = Duration::from_millis(200);

/// Metadata key naming the route/consumer a captured message came from.
pub const CAPTURE_SOURCE_KEY: &str = "ui_source";
/// Metadata key holding the capture timestamp, as epoch milliseconds.
pub const CAPTURE_TIME_KEY: &str = "ui_capture_time";

/// Formats a [`CAPTURE_TIME_KEY`] value (epoch milliseconds) as RFC 3339,
/// yielding an empty string when it is absent or unparseable.
pub fn format_capture_time(epoch_millis: Option<&str>) -> String {
    epoch_millis
        .and_then(|ms| ms.parse::<i64>().ok())
        .and_then(chrono::DateTime::from_timestamp_millis)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default()
}

/// One observation of a route's cumulative message count, plus the smoothed rate
/// derived from it.
#[derive(Clone, Copy, Debug)]
pub struct RouteMetricSample {
    pub total_messages: f64,
    pub observed_at: Instant,
    pub smoothed_throughput: f64,
}

/// Folds a new cumulative count into the previous sample, producing an updated
/// time-weighted EWMA of messages per second.
pub fn next_route_metric_sample(
    previous: Option<RouteMetricSample>,
    total_messages: f64,
    observed_at: Instant,
) -> RouteMetricSample {
    let smoothed_throughput = if let Some(previous_sample) = previous {
        let elapsed = observed_at
            .duration_since(previous_sample.observed_at)
            .as_secs_f64();
        if elapsed > 0.0 {
            let current_rate = (total_messages - previous_sample.total_messages).max(0.0) / elapsed;

            // Time-weighted alpha: alpha = 1 - exp(-delta_t / tau)
            let alpha = 1.0 - (-elapsed / THROUGHPUT_TAU).exp();
            alpha * current_rate + (1.0 - alpha) * previous_sample.smoothed_throughput
        } else {
            previous_sample.smoothed_throughput
        }
    } else {
        0.0
    };
    RouteMetricSample {
        total_messages,
        observed_at,
        smoothed_throughput, // First observation: we have no previous throughput to smooth, so start at 0.
    }
}

/// Message counters and their sampled throughput, keyed by route (or consumer) key.
///
/// Clone freely — clones share the same counters and the same sampler task.
#[derive(Clone, Default)]
pub struct RouteMetrics {
    counters: Arc<RwLock<HashMap<String, Arc<AtomicU64>>>>,
    samples: Arc<RwLock<HashMap<String, RouteMetricSample>>>,
    updater_started: Arc<AtomicBool>,
}

impl RouteMetrics {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns the counter for `key`, creating it on first use. Increment it once
    /// per message from the route's handler.
    pub async fn counter_for(&self, key: &str) -> Arc<AtomicU64> {
        let mut counters = self.counters.write().await;
        counters
            .entry(key.to_string())
            .or_insert_with(|| Arc::new(AtomicU64::new(0)))
            .clone()
    }

    /// Total messages counted for `key` since its counter was created.
    pub async fn sequence(&self, key: &str) -> u64 {
        self.counters
            .read()
            .await
            .get(key)
            .map(|counter| counter.load(Ordering::Relaxed))
            .unwrap_or(0)
    }

    /// Smoothed messages per second for `key`, or 0.0 if it has never been sampled.
    pub async fn throughput(&self, key: &str) -> f64 {
        self.samples
            .read()
            .await
            .get(key)
            .map(|sample| sample.smoothed_throughput)
            .unwrap_or(0.0)
    }

    /// Smoothed messages per second for every sampled key.
    pub async fn throughputs(&self) -> HashMap<String, f64> {
        self.samples
            .read()
            .await
            .iter()
            .map(|(key, sample)| (key.clone(), sample.smoothed_throughput))
            .collect()
    }

    /// Total messages counted for every key.
    pub async fn sequences(&self) -> HashMap<String, u64> {
        self.counters
            .read()
            .await
            .iter()
            .map(|(key, counter)| (key.clone(), counter.load(Ordering::Relaxed)))
            .collect()
    }

    /// Drops the counter and samples for `key`, so a stopped route stops being
    /// reported.
    pub async fn forget(&self, key: &str) {
        self.counters.write().await.remove(key);
        self.samples.write().await.remove(key);
    }

    /// Spawns the background sampler that converts counters into smoothed rates,
    /// if it is not already running and a tokio runtime is available.
    pub fn ensure_updater(&self) {
        if self.updater_started.load(Ordering::Relaxed) {
            return;
        }

        if let Ok(handle) = tokio::runtime::Handle::try_current()
            && self
                .updater_started
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
        {
            let counters_arc = Arc::clone(&self.counters);
            let samples_arc = Arc::clone(&self.samples);
            handle.spawn(async move {
                let mut interval = tokio::time::interval(THROUGHPUT_UPDATE_INTERVAL);

                loop {
                    interval.tick().await; // Wait for the next interval tick
                    let now = Instant::now();

                    let counters = counters_arc.read().await.clone();
                    let mut samples = samples_arc.write().await;

                    for (key, counter) in counters.iter() {
                        let total_messages = counter.load(Ordering::Relaxed) as f64;
                        let previous_sample = samples.get(key).copied();
                        let next_sample =
                            next_route_metric_sample(previous_sample, total_messages, now);
                        samples.insert(key.clone(), next_sample);
                    }
                }
            });
        }
    }
}

/// A bounded, most-recent-N buffer of the messages flowing through a route,
/// backed by an in-process memory channel.
///
/// Reads are destructive: [`drain`](Self::drain) takes the buffered messages
/// rather than copying them, so a second reader sees an empty buffer. Both the
/// UI's `/messages` endpoint and the MCP's capture tool rely on that same
/// take-and-clear behaviour.
#[derive(Clone)]
pub struct MessageCapture {
    channel: MemoryChannel,
}

impl MessageCapture {
    /// Opens (or creates) the capture buffer for `topic`, holding at most
    /// `keep_last` messages.
    pub fn with_capacity(topic: &str, keep_last: usize) -> Self {
        Self {
            channel: get_or_create_channel(&MemoryConfig::new(topic, Some(keep_last.max(1)))),
        }
    }

    /// Opens the capture buffer for `topic` for reading, without asserting a
    /// capacity — use when the writer has already created it.
    pub fn open(topic: &str) -> Self {
        Self {
            channel: get_or_create_channel(&MemoryConfig::new(topic, None)),
        }
    }

    /// Records `msg`, tagging it with its source and capture time.
    ///
    /// Never blocks the route: if the buffer is full the oldest entry is dropped
    /// to preserve "last N" semantics.
    pub fn push(&self, source_key: &str, mut msg: CanonicalMessage) {
        msg.metadata
            .insert(CAPTURE_SOURCE_KEY.into(), source_key.to_string());
        msg.metadata.insert(
            CAPTURE_TIME_KEY.into(),
            chrono::Utc::now().timestamp_millis().to_string(),
        );

        let batch = vec![msg];
        if let Err(err) = self.channel.sender.try_send(batch) {
            let batch = err.into_inner();
            let _ = self.channel.receiver.try_recv();
            let _ = self.channel.sender.try_send(batch);
        }
    }

    /// Takes every buffered message, leaving the buffer empty.
    pub fn drain(&self) -> Vec<CanonicalMessage> {
        let mut messages = Vec::new();
        while let Ok(batch) = self.channel.receiver.try_recv() {
            messages.extend(batch);
        }
        messages
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_route_metric_sample_starts_with_zero_throughput() {
        let now = Instant::now();

        let sample = next_route_metric_sample(None, 42.0, now);

        assert_eq!(sample.total_messages, 42.0);
        assert_eq!(sample.observed_at, now);
        assert_eq!(sample.smoothed_throughput, 0.0);
    }

    #[test]
    fn next_route_metric_sample_applies_ema_to_instantaneous_throughput() {
        let start = Instant::now();
        let previous = RouteMetricSample {
            total_messages: 10.0,
            observed_at: start,
            smoothed_throughput: 4.0,
        };

        let next = next_route_metric_sample(Some(previous), 18.0, start + Duration::from_secs(2));

        // Instantaneous throughput is (18 - 10) / 2 = 4.0, so the EMA stays at 4.0.
        assert_eq!(next.smoothed_throughput, 4.0);
    }

    #[test]
    fn next_route_metric_sample_clamps_negative_throughput_before_smoothing() {
        let start = Instant::now();
        let previous = RouteMetricSample {
            total_messages: 10.0,
            observed_at: start,
            smoothed_throughput: 6.0,
        };

        // A counter that went backwards (route restarted) must not yield a
        // negative rate; the clamped 0 rate decays the previous value instead.
        let next = next_route_metric_sample(Some(previous), 8.0, start + Duration::from_secs(1));

        let expected = 6.0 * (-1.0f64 / THROUGHPUT_TAU).exp();
        assert!((next.smoothed_throughput - expected).abs() < 1e-9);
    }

    #[tokio::test]
    async fn counter_for_returns_the_same_counter_per_key() {
        let metrics = RouteMetrics::new();

        let first = metrics.counter_for("route-a").await;
        first.fetch_add(3, Ordering::Relaxed);
        let second = metrics.counter_for("route-a").await;

        assert_eq!(second.load(Ordering::Relaxed), 3);
        assert_eq!(metrics.sequence("route-a").await, 3);
        assert_eq!(metrics.sequence("route-b").await, 0);
    }

    #[tokio::test]
    async fn forget_drops_a_stopped_routes_counter() {
        let metrics = RouteMetrics::new();
        metrics
            .counter_for("route-a")
            .await
            .fetch_add(5, Ordering::Relaxed);

        metrics.forget("route-a").await;

        assert_eq!(metrics.sequence("route-a").await, 0);
        assert!(metrics.sequences().await.is_empty());
    }

    #[test]
    fn capture_keeps_the_most_recent_messages() {
        let capture = MessageCapture::with_capacity("route_metrics_test_keep_last", 2);

        capture.push("src", CanonicalMessage::from("first"));
        capture.push("src", CanonicalMessage::from("second"));
        capture.push("src", CanonicalMessage::from("third"));

        let drained = capture.drain();
        let payloads: Vec<String> = drained
            .iter()
            .map(|m| m.get_payload_str().to_string())
            .collect();

        assert_eq!(payloads, vec!["second", "third"]);
        assert_eq!(
            drained[0]
                .metadata
                .get(CAPTURE_SOURCE_KEY)
                .map(String::as_str),
            Some("src")
        );
        assert!(drained[0].metadata.contains_key(CAPTURE_TIME_KEY));
        // Reads are destructive.
        assert!(capture.drain().is_empty());
    }
}
