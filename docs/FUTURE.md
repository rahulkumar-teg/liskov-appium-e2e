# FUTURE.md — deferred items (plan §9.3)

> See also [`STATUS.md`](STATUS.md) (live state) and the design plan §9.3 (local-only, git-ignored `docs/plan/`).

Not planned for the one-Mac setup. Each item has a trigger; when the trigger happens the item is **re-planned**, not silently started.

| Item | Review | Trigger |
|---|---|---|
| `RedisLeaseStore` (multi-host account/device coordination) behind `AccountCoordinator` | C5 | A **second runner** (another Mac or a CI device host) |
| Docker / CI parity gate | C20 | **CI live** (a pipeline on the remote; the GitHub remote `rahulkumar-teg/liskov-appium-e2e` alone is not the trigger) |
| Google Sheets writer for results | C21 | CI live |
| Remote artifact store (S3/GCS) for builds | C4 | CI live (or a second runner) |
| Datadog / New Relic metrics push | C13 | A concrete **observability need** (e.g. tracking flake rate across teams) |
| Chaos / fault-injection suite (kill WDA/UIA2, drop sessions) | C22 | A **stable suite** (≥ 4 consecutive green release runs on the minimum matrix) |
| ADRs / runbook / troubleshooting docs | C24 | Not in the agreed v3 scope; propose when the framework is first implemented |
