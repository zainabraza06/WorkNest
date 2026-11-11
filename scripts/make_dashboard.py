"""Regenerates ops/grafana/dashboards/worknest-api.json (keeps the dashboard diffable)."""
import json
from pathlib import Path

DS = {"type": "prometheus", "uid": "prometheus"}


def panel(i, title, targets, x, y, unit=None):
    return {
        "id": i, "type": "timeseries", "title": title,
        "gridPos": {"x": x, "y": y, "w": 12, "h": 8},
        "datasource": DS,
        "fieldConfig": {"defaults": {"unit": unit} if unit else {}, "overrides": []},
        "targets": [{"expr": e, "legendFormat": l, "refId": chr(65 + n), "datasource": DS} for n, (e, l) in enumerate(targets)],
    }


Q = "http_request_duration_seconds"


def pct(q, by=""):
    return f"histogram_quantile({q}, sum by (le{by}) (rate({Q}_bucket[5m])))"


dash = {
    "uid": "worknest-api", "title": "WorkNest API", "schemaVersion": 39, "version": 1,
    "refresh": "30s", "time": {"from": "now-6h", "to": "now"},
    "panels": [
        panel(1, "Requests / s by status class", [(f"sum by (status_class) (rate({Q}_count[5m]))", "{{status_class}}")], 0, 0, "reqps"),
        panel(2, "5xx error ratio", [(f'sum(rate({Q}_count{{status_class="5xx"}}[5m])) / sum(rate({Q}_count[5m]))', "5xx")], 12, 0, "percentunit"),
        panel(3, "Latency p50 / p95 / p99", [(pct(0.5), "p50"), (pct(0.95), "p95"), (pct(0.99), "p99")], 0, 8, "s"),
        panel(4, "p95 latency by route", [(pct(0.95, ", route"), "{{route}}")], 12, 8, "s"),
        panel(5, "AI service calls by outcome", [("sum by (outcome) (rate(ai_service_calls_total[5m]))", "{{outcome}}")], 0, 16),
        panel(6, "Socket connections", [("socket_connections", "sockets")], 12, 16),
        panel(7, "Event loop lag p99", [("nodejs_eventloop_lag_p99_seconds", "p99")], 0, 24, "s"),
        panel(8, "Memory", [("process_resident_memory_bytes", "rss"), ("nodejs_heap_size_used_bytes", "heap used")], 12, 24, "bytes"),
    ],
}
out = Path(__file__).resolve().parent.parent / "ops/grafana/dashboards/worknest-api.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(dash, indent=2) + "\n", encoding="utf8")
print("wrote", out)
