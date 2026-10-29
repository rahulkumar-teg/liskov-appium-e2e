# liskov-appium-e2e — STATUS

_Last updated: 2026-10-29 ~16:42 IST._ Full per-attempt history: `docs/archive/STATUS-log-2026-10-28_29.md` (local-only, git-ignored).
Skip-reason meanings, challenges and workarounds: see the [README](../README.md).

## Summary

| Item | State |
|---|---|
| Specs | 34 EP specs written (`specs/epaper/ep01…ep34`), one file per case, both platforms per file, platform-gated. Plus `specs/maintenance/login.spec.ts` and `restore-own.spec.ts`. |
| Android real (OnePlus CPH2767, user 0) | **15 pass / 16 skip / 0 fail** of 31 run on app 4.110.0-main-4806026 (EP-06/13/15 not run). Same outcome on 4.108.0 debug. |
| iOS real (iPhone 17, iOS 26.7.1) | **14 pass / 17 skip / 0 fail** of 31 run on app 4.112.0 (4820919) (EP-06/13/15 not run). |
| Android emulator (Pixel_10_Pro AVD, emulator-5554, API 37, 16 KB page size) | **15 pass / 0 fail** of the 15 specs that pass on the OnePlus (EP-01, 02, 03, 04, 05, 11, 12, 14, 16, 18, 20, 21, 22, 26, 28; 17 tests), logged in as user1 via `make login`. App: origin/main `ac10c30a17` economistDebug 4.108.0 (1), installed `--user 0`. Run 15:44:51–15:59:42 IST. Report `reports/allure-android-emu-20261029-1600/html` (served on :5054). The other 16 specs were not run on the emulator. |
| Login script | `make login TARGET=android-emu SERIAL=emulator-5554` (or `npm run login -- --target android-emu --serial emulator-5554 [--account user1] [--relogin/--no-relogin]`). Flow: fresh launch → popups → Home → Menu → Settings → Log in → hosted page (Chrome Custom Tab) → back → popups → Settings shows **Log out** (read only) → entitlement. Relogin (logout then login) is ON by default for the emulator and OFF for real devices. 15:38 login branch: PASS. 15:42–15:44 relogin branch: PASS (`reports/evidence-android-emu/LOGIN/run2-relogin-final-settings-log-out.png`). Not run on a real device; the iOS path is written but not run. |
| Post-cleanup check (emulator-5554, user 0, Appium 4727 / systemPort 8213) | Relogin `npm run login -- --relogin --target android-emu --serial emulator-5554 --port 4727` 16:25:27–16:27:14 IST: logout-then-login → Settings shows **Log out**, exit 0, leak scan clean. Then `make run-many TARGET=android-emu EPS="ep01 ep04 ep16 ep21 ep28"` 16:27:23–16:34:18 IST: **5/5 PASS** first attempt (8 tests incl. login, 0 fail/skip). Report `reports/allure-cleanup-1625/html` (served on :5055 — :5054 is still serving the 16:00 report). |
| iOS origin/main Debug | **Blocked:** crashes on launch (see README › Challenges). |
| Fast checks (after the cleanup + parking, 16:40 IST) | `make check` exit 0: tsc 0 · eslint 0 · unit 101 passing (incl. parked list) · contract 114 passing / 1 pending (`LISKOV_REPO=~/Documents/mobile-liskov`, read-only). Leak scan clean (82 values, 2,209 files). First commit would be 162 files / 1.46 MB, no secret values. |
| Git | `git init`, **no commits**. Remote `origin` = `github.com/rahulkumar-teg/liskov-appium-e2e` (private; TODO: create the empty GitHub repo, then first commit after review). |

## Per-EP results (latest run per platform)

Legend: PASS · SKIP reason · NR = not run (offline, awaiting Rahul's OK) · – = not run on the emulator. Results are from before the parking; from 16:38 IST every non-PASS row (and EP-16 on iOS) is parked — see below.

| EP | Title | Android (OnePlus 4.110) | iOS (iPhone 17 4.112) | Emulator |
|---|---|---|---|---|
| 01 | Download menu offers Articles & audio + Print edition | PASS | PASS | PASS |
| 02 | Download Articles & audio to completion | PASS | PASS | PASS |
| 03 | Download Print edition to completion | PASS | PASS | PASS |
| 04 | Both formats → Edition downloaded + Delete | PASS | PASS | PASS |
| 05 | Delete both formats (cancel once, then confirm) | PASS | PASS | PASS |
| 06 | E2E journey: A&A coexistence, relaunch, offline | NR | NR | – |
| 07 | Legacy A&A download when PDF flag OFF | FLAG_OFF | FLAG_OFF | – |
| 08 | Logged-out user prompted (paywall) | WOULD_LOGOUT | WOULD_LOGOUT | – |
| 09 | PDF controls only for editions ≥ min date | GATED_BY_OPEN_QUESTION | GATED_BY_OPEN_QUESTION | – |
| 10 | Print controls on iPad | NOT_ON_PLATFORM | NOT_ON_PLATFORM (iPad) | – |
| 11 | Read PDF with zoom & pan | PASS | PASS | PASS |
| 12 | ePaper controls shown when flag ON | PASS | PASS | PASS |
| 13 | View offline without PDF → no-internet alert | NR | NR | – |
| 14 | View print edition online downloads inline | PASS | PASS | PASS |
| 15 | View offline from local storage | NR | NR | – |
| 16 | Cancel in-progress download | PASS | PRECONDITION (no throttling) | PASS |
| 17 | Concurrent PDF limit & queue (≥3) | PRECONDITION | PRECONDITION | – |
| 18 | Dismiss viewer during inline download | PASS | PASS | PASS |
| 19 | Regional PDFs (AP/EU/NA) | GATED_BY_OPEN_QUESTION | GATED_BY_OPEN_QUESTION | – |
| 20 | Last-read page restores per edition | PASS | PASS | PASS |
| 21 | Manage deletes A&A after confirm | PASS | PASS | PASS |
| 22 | Manage deletes Print after confirm | PASS | PASS | PASS |
| 23 | Orientation keeps current page | NOT_ON_PLATFORM (phone portrait) | NOT_ON_PLATFORM (portrait-locked) | – |
| 24 | Excluded-date edition hides PDF controls | GATED_BY_OPEN_QUESTION | GATED_BY_OPEN_QUESTION | – |
| 25 | PDF limit evicts oldest | PRECONDITION | PRECONDITION | – |
| 26 | Download persists across background/tab/relaunch | PASS | PASS | PASS |
| 27 | PDF internal links open & return | GATED_BY_OPEN_QUESTION | GATED_BY_OPEN_QUESTION | – |
| 28 | Page indicator & navigation | PASS | PASS | PASS |
| 29 | Tablet sharpness | NOT_ON_PLATFORM | NOT_ON_PLATFORM (Android-only) | – |
| 30 | Regional editions load correct PDF | GATED_BY_OPEN_QUESTION | GATED_BY_OPEN_QUESTION | – |
| 31 | Retry failed A&A after reconnect | PRECONDITION | PRECONDITION | – |
| 32 | Retry failed Print download | PRECONDITION | PRECONDITION | – |
| 33 | Waiting for Wi-Fi on cellular | PRECONDITION (SIM) | PRECONDITION (SIM) | – |
| 34 | Zoom text quality | PRECONDITION (manual) | PRECONDITION (manual) | – |

Reports (local, git-ignored): Android `reports/allure-4110-20261029-0909/html`, iOS `reports/allure-ios-20261029-1126/html`,
emulator `allure-results-android-emu/` (report on :5054 when generated).

## Parked specs (explicit skips, Rahul 16:38 IST)

Everything outside the currently passing set (Android EP-01–05, 11, 12, 14, 16, 18, 20, 21, 22, 26, 28; iOS the same
minus EP-16) now **SKIPs up front** from one list, [`specs/support/parked.ts`](../specs/support/parked.ts), applied in
`gate()`. It is a real Mocha skip with a typed reason (Allure: *skipped*, label `skipReason`, tag `parked`), never a pass;
spec bodies are unchanged. Reversible: delete an entry, or `RUN_PARKED=1` to send every parked case through its normal
gate. `tests/unit/parked.spec.ts` (part of `make check`) asserts the list matches the passing sets. Checked on the
emulator 16:39 IST: EP-06 → `SKIP:PRECONDITION … parked`, Allure 1 skipped / 0 passed.

| EP | Parked on | Skip reason | Why |
|---|---|---|---|
| 06 | both | `PRECONDITION` | offline step: needs Rahul’s OK (ALLOW_OFFLINE=1) or a dedicated device |
| 07 | both | `FLAG_OFF` | needs epaper_pdf_download_enabled=false declared in config/flags.override.json (the framework never toggles flags) |
| 08 | both | `WOULD_LOGOUT` | needs a logged-out app state; specs never log out |
| 09 | both | `GATED_BY_OPEN_QUESTION` | needs an edition before epaper_pdf_download_min_date in Browse editions |
| 10 | both | `NOT_ON_PLATFORM` | iPad-only case; the test devices are phones |
| 13 | both | `PRECONDITION` | offline step: needs Rahul’s OK (ALLOW_OFFLINE=1) or a dedicated device |
| 15 | both | `PRECONDITION` | offline step: needs Rahul’s OK (ALLOW_OFFLINE=1) or a dedicated device |
| 16 | iOS only | `PRECONDITION` | no network throttling on iOS: the download finishes before it can be cancelled |
| 17 | both | `PRECONDITION` | needs network throttling and a serial account for ≥3 concurrent PDF downloads (heavy) |
| 19 | both | `GATED_BY_OPEN_QUESTION` | needs ≥2 REGIONS with a locale change per launch and a staging PDF contentId |
| 23 | both | `NOT_ON_PLATFORM` | phones are portrait-locked; needs a device that rotates (tablet) |
| 24 | both | `GATED_BY_OPEN_QUESTION` | needs a known excluded-date edition |
| 25 | both | `PRECONDITION` | heavy multi-PDF eviction case (serial account, nightly); not run on a personal device |
| 27 | both | `GATED_BY_OPEN_QUESTION` | needs a real staging PDF (PDF_STAGING_CONTENT_IDS / PDF_STAGING_FILES) |
| 29 | both | `NOT_ON_PLATFORM` | Android tablet-only, manual verdict |
| 30 | both | `GATED_BY_OPEN_QUESTION` | needs ≥2 REGIONS with a locale change per launch and a staging PDF contentId |
| 31 | both | `PRECONDITION` | offline step: needs Rahul’s OK (ALLOW_OFFLINE=1) or a dedicated device; also needs network throttling |
| 32 | both | `PRECONDITION` | offline step: needs Rahul’s OK (ALLOW_OFFLINE=1) or a dedicated device; also needs network throttling |
| 33 | both | `PRECONDITION` | needs a cellular-only (SIM) network |
| 34 | both | `PRECONDITION` | manual assisted capture: human verdict, not automated (D13) |

## Open items / pending

1. First commit + push to `rahulkumar-teg/liskov-appium-e2e` after Rahul approves the file list. The GitHub repo itself still has to be created (empty, private).
2. Rahul to decide: keep or scrub the company Apple team id and the device serial/UDID that still appear in the docs (plan docs, archive, `config/devices.example.yaml`). Code defaults are removed.
3. Offline specs EP-06/13/15 (and 31/32) — parked; need Rahul's OK (`ALLOW_OFFLINE=1`) or a dedicated device, then un-park.
4. Inputs needed: a staging PDF contentId (EP-19/27/30), ≥2 REGIONS, network throttling, a SIM-only network, an iPad / Android tablet.
5. iOS origin/main Debug crash (app bug, report to the iOS team) — TODO: owner.
6. Register devices in `config/devices.yaml` (`envSetBy` still pending, so `make validate` exits 1).
7. Wire RunHistory + flag readers into the wdio hooks; wire the `make smoke|p0|…` priority suites (they stop with exit 78; use `make run-many`).
8. `scripts/login.ts --target ios-sim` (needs a `wdio.ios-sim.conf.ts`).

Done 2026-10-29: emulator run (15/15), relogin + 5 sample specs after the cleanup, code cleanup pass (see README §9).
