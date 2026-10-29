# liskov-appium-e2e

Standalone Appium + WebdriverIO end-to-end framework for **The Economist** app (`mobile-liskov`, bundle/package
`com.economist.lamarr`), covering the **34 ePaper / Print-edition download cases EP-01…EP-34** on **iOS and Android**.

- **Real app, real data, no mocks.** Specs drive the installed app against the real Staging/Prod backends. No mock
  server, no proxy rules, no debug menus, no `run-as`, no flag toggling.
- **Standalone.** Nothing in `mobile-liskov` is changed. The L0 contract layer only *reads* a mobile-liskov checkout
  (`LISKOV_REPO`).
- **Assert behaviour only.** Specs observe what the app does; they never change content, flags, subscriptions or
  newsletters. The only state they change is a download they started themselves (and, with Rahul's OK, deleting an
  already-downloaded edition through the app's own Delete flow so a case can start from "Download").

Current results: [`docs/STATUS.md`](docs/STATUS.md). Deferred items: [`docs/FUTURE.md`](docs/FUTURE.md).
The design plan (v3.1, referred to as "plan §…" in code comments), its older versions, the full status log and the
implementation notes are **local-only working docs** (git-ignored `docs/plan/`, `docs/archive/`,
`docs/implementation-notes.md`); ask Rahul for a copy.

---

## Contents
1. [Layout](#1-layout)
2. [Prerequisites](#2-prerequisites)
3. [Local configuration (.env and config/)](#3-local-configuration)
4. [Device setup](#4-device-setup)
5. [How to log in (scripts/login.ts)](#5-how-to-log-in)
6. [How to run](#6-how-to-run)
7. [Results so far and skip reasons](#7-results-so-far-and-skip-reasons)
8. [Current challenges and workarounds](#8-current-challenges-and-workarounds)
9. [Repo state](#9-repo-state)
10. [Guardrails / safety rules](#10-guardrails--safety-rules)

---

## 1. Layout

| Path | What |
|---|---|
| `tests/contract/` | **L0 contract layer** (own Mocha runner, no Appium): header-state map ↔ `strings.xml`, locators ↔ `TestTagConstants.kt` / `AccessibilityIds.swift`, flag defaults, PDF URL/region rules, PdfInspector. Needs `LISKOV_REPO`; fails closed with `INFRA:CONTRACT` without it. |
| `tests/unit/` | Framework unit tests (locks, account leases, config, secrets, history, flags, Amplitude ids, devices, validate, popups, SpringBoard banner parser). |
| `specs/epaper/ep01…ep34-*.spec.ts` | One Mocha spec per EP case; both platforms in one file, gated per platform/precondition. |
| `specs/maintenance/` | `login.spec.ts` (used by `scripts/login.ts`) and `restore-own.spec.ts` (deletes only downloads the framework made). |
| `specs/support/popups.ts` | **Central popup/interstitial handler** (Android + iOS tables). Only ever taps a dismiss/negative control; anything that could log out, buy, subscribe, allow or change a setting is refused. |
| `specs/support/ui.ts` | Screen helpers: open Weekly, header state, download/delete/cancel, viewer (pinch, swipe, page indicator, thumbnails). |
| `specs/support/flows.ts` | Shared flows: start-from-NOTHING guard, entitlement check, owned-download tracking, network control, **login via Settings**, `freshLaunchToHome`, `assertLoggedInViaSettings`. |
| `specs/support/iosGuard.ts` | iOS foreground/banner guard: every iOS tap goes through `guardedClick` / `guardedTapAt` / `edgeSwipeBack`. |
| `specs/support/gate.ts`, `catalog.ts`, `parked.ts` | Per-case needs → `SKIP:<reason>`; the EP catalogue; the parked-cases list (explicit skips). |
| `src/` | Core (config loader, `.env` handling, locks, waits, errors), accounts/leases, secrets (`SecretString`, `typeSecret`), locators, models, services (flag readers, login form), history (SQLite), build/install helpers. |
| `config/` | Accounts (refs only), secrets (refs only), environments, regions, flag defaults, header-state map, examples for local files. |
| `scripts/` | `login.ts`, `appium-dev.sh` (start/stop our Appium, one pid/log per port), `doctor.sh`, `validate.ts`, `secret-leak-scan.ts`, `register-device.ts`, `build-from-commit.sh`, `flake-report.ts`, `login-page-guard.ts`, `locks-doctor.ts`, `contract-mutations.ts`, `flags-init.ts`. |
| `scripts/run/` | `run-one.sh <target> <ep> [attempt]` and `run-many.sh <target> ep01 ep02 …` — the device runners (no hard-coded device ids). |
| `scripts/dev/` | **Local-only (git-ignored).** Read-only explore/probe tools used while writing specs (`android-explore`, `ios-explore`, `ios-springboard-probe`, `ios-activate`, `probe-staging-pdfs`). Not part of a run. |
| `wdio.base.ts` | Shared WDIO settings: failure evidence, hooks, Allure reporter, port check, the Android capability set and `before()` (bring the app to the front, settle popups). Sets `TARGET` for the gate. |
| `wdio.android-real.conf.ts`, `wdio.android-emu.conf.ts`, `wdio.ios-real.conf.ts` | Per-target configs on top of `wdio.base.ts`: device pinning / allow-list (emulator: only `emulator-5554` as `Pixel_10_Pro`), iOS WDA signing from `config/wda.local.json`. |

## 2. Prerequisites

| Tool | Version / note |
|---|---|
| Node | 22 LTS (`.nvmrc`); 24/26 also work (`engines: ^22.12.0 \|\| >=24.0.0`). `npm ci`. |
| Appium | 3.9.0 (devDependency) with a **framework-local** `APPIUM_HOME=~/.liskov-appium/appium-home` (never `~/.appium`). |
| Drivers | `appium-uiautomator2-driver@8.7.0`, `appium-xcuitest-driver@12.22.2` (bundles WebDriverAgent 16.17.6). npm 11.19 rejects `appium driver install` (EALLOWSCRIPTS); install them with `npm install --save-exact <driver>@<ver>` inside `APPIUM_HOME`. |
| JDK | 17 (Homebrew `openjdk@17`) — for building the Android app and for UiAutomator2. |
| Android SDK | `adb` at `~/Library/Android/sdk/platform-tools/adb` (override with `ADB`). |
| Xcode | 27.1 (pinned in `scripts/doctor.sh`); an Apple ID signed in for automatic signing of WDA. |
| Allure | `allure-commandline` 2.46.1 (devDependency, via `npx allure`). |

`make doctor` checks the pins (read-only).

## 3. Local configuration

```bash
npm ci
cp .env.example .env && chmod 600 .env       # then fill USER1_* and the app keys (see the comments inside)
cp config/devices.example.yaml config/devices.yaml          # device registry (git-ignored)
cp config/wda.local.example.json config/wda.local.json && chmod 600 config/wda.local.json   # iOS only
npm run flags:init                            # optional: config/flags.override.json from the example
```

- `.env` keys come in three groups (details in [`.env.example`](.env.example)): **settings** (loaded into
  `process.env`), **secrets** (`USER1_*` and app keys copied from mobile-liskov's `.env`; read privately by
  `SecretsBroker`, never in `process.env`, never printed) and **per-run knobs** (serial, specs, opt-ins — export in the shell).
- Other accounts are 1Password references (`op://Automation/…`) in `config/accounts.ts`; not resolved unless asked.
- Git-ignored local files: `.env`, `config/{devices.yaml,wda.local.json,flags.override.json,amplitude-ids.json}`.

## 4. Device setup

### Android real device (OnePlus, personal profile)
- Developer options: USB debugging, **Install via USB**, and "Disable permission monitoring" if offered (ColorOS
  otherwise hangs the UiAutomator2 server install).
- The phone has a Work profile. Use the **personal profile, user 0** only: install everything with `--user 0`
  (`adb install --user 0 …`, `cmd package install-existing --user 0 com.economist.lamarr`), including
  `io.appium.settings`, `io.appium.uiautomator2.server` and `.server.test`. A plain `adb install` puts them in every
  user — remove ours from the Work profile if that happens; never touch the Work-profile apps.
- Caps used: `skipServerInstallation`, `skipDeviceInitialization`, `noReset`, `systemPort 8213`, Appium port 4725.
- The phone must be unlocked (runners stop with `LOCKED` on a keyguard).

### Android emulator (Pixel_10_Pro AVD, API 37, 16 KB page size)
- `wdio.android-emu.conf.ts` accepts **only `emulator-5554` while `adb emu avd name` = `Pixel_10_Pro`**; every other
  serial is refused. Appium port 4727, systemPort 8213. Never use the other AVDs (`Pixel_XL_CI*`, mock-server port 4000).
- The image has a **second user 10 (private space)**: plain `pm list packages` fails with "Shell does not have
  permission to access user 10". Always pass `--user 0` (`adb install --user 0 …`, `pm list packages --user 0`) and
  make sure the Appium helper APKs land on user 0. Don't touch user 10.
- The app under test is built from mobile-liskov origin/main: `./gradlew :app:assembleEconomistDebug` (JDK 17) in a
  separate git worktree, never in someone's working checkout.
- A fresh emulator is logged out → run the login script (§5) before the subscriber specs.

### iOS real device (iPhone)
- **WebDriverAgent** is signed with **your own (personal) team, automatic signing**, never the Economist company team
  (that one uses Manual/Match signing). Bundle id **`com.liskovappium.e2e.WebDriverAgentRunner`**,
  derived data `~/.liskov-appium/wda-derived`. Team id goes only in `config/wda.local.json` (git-ignored).
- First launch: on the phone **Settings › General › VPN & Device Management › Apple Development: \<you\> › Trust**.
  Enable **Developer Mode** (Settings › Privacy & Security) if asked.
- Before a run: turn on a **Focus / Do Not Disturb**, and **turn off notifications for Slack and other chatty apps**
  (banners and apps coming to the front break taps — see §8).
- Appium port 4726 (WDA 8111). The app is used as installed (`noReset`, no reinstall).

## 5. How to log in

`scripts/login.ts` (wrapped by `npm run login` and `make login`) logs in through the **app UI** with credentials from
`.env` (`USER1_EMAIL`, `USER1_PASSWORD`, role `USER1_ROLE=core_digital`, account key `user1` in `config/accounts.ts`).
Values are typed with logging silenced and are never printed; afterwards the run log, the Appium log and the evidence
dir are leak-scanned (`scripts/secret-leak-scan.ts`) and the script exits 5 if any secret value is found.

Flow (`specs/maintenance/login.spec.ts` → `flows.loginViaSettings`):
1. **Fresh launch:** terminate the app (process stop only, never clear data), then relaunch.
2. **Clear popups until Home** (central `popups.ts` table).
3. **Menu › Settings › Log in** (top-right link).
4. **myaccount.economist.com** page (browser tab): fill **Email address** and **Password**, tap **Log in**. Email and
   password route only — never the one-time code, Google, Apple, Facebook or SSO buttons.
5. **Clear post-login popups** until Home is stable with no new popup for `LOGIN_SETTLE_MS` (default 6000 ms) —
   includes the **Newsletters** screen, where only **Continue** is tapped (never "Signed up", remove buttons or the dropdown).
6. **Verify:** Menu › Settings shows **"Log out"** at the top right and "Log in" is gone (read only — never tapped),
   within a bounded wait; screenshot `…/LOGIN/final-settings-log-out.png`. Then a read-only entitlement check.

**Relogin (`--relogin`):** if Settings already shows Log out, log out first (Settings › Log out › the app's confirmation
› verify "Log in"), then do steps 3–6. **Default ON for `android-emu`, OFF for real devices** (the
owner's own account lives there) unless `--relogin` or `LOGIN_RELOGIN=1` is given. With relogin off and already logged
in, it does nothing (exit 0). Specs themselves never log out.

```bash
# Emulator (relogin on by default)
npm run login -- --target android-emu --serial emulator-5554 --port 4727
make login TARGET=android-emu SERIAL=emulator-5554 PORT=4727          # same; RELOGIN=0 to disable
# Real Android / iOS (relogin off unless asked)
npm run login -- --target android-real --serial <adb-serial> --port 4725 [--relogin]
npm run login -- --target ios-real --udid <udid> --port 4726 [--relogin]
```

Exit codes: 0 logged in / already logged in · 2 `INFRA:WRONG_ACCOUNT` · 3 `INFRA:LOGIN_CHALLENGE` (captcha / 2FA /
emailed code — stops, needs a human) · 5 secret found in logs · 64 bad arguments. Logs: `reports/login/`; the Appium log
for that port (`~/.liskov-appium/appium-<port>.log`) is leak-scanned too. TODO: `--target ios-sim` (needs a `wdio.ios-sim.conf.ts`).

## 6. How to run

| What | Command |
|---|---|
| Everything without a device | `make check` (= typecheck, lint, unit, contract) |
| Typecheck / lint / unit | `make typecheck` · `make lint` · `make unit` |
| Contract (L0) | `LISKOV_REPO=~/Documents/mobile-liskov make contract` · `make contract-mutations` |
| Validate (dry run) | `make validate` |
| Appium (ours only) | `APPIUM_PORT=4727 make appium-start\|appium-status\|appium-stop` (or `scripts/appium-dev.sh`); one server per port: 4725 OnePlus, 4726 iPhone, 4727 emulator; logs `~/.liskov-appium/appium-<port>.log` |
| One spec | `ANDROID_SERIAL=emulator-5554 make run-one TARGET=android-emu EP=ep03` (= `scripts/run/run-one.sh android-emu ep03`; real devices: `TARGET=android-real` + `ANDROID_SERIAL=<serial>`, or `TARGET=ios-real` + `IOS_UDID=<udid>`). Checks the AVD / lock screen first, starts our Appium if needed; logs `reports/suite-<target>/`, results `allure-results-<target>/`, evidence `reports/evidence-<target>/` (override with `SUITE_DIR` / `ALLURE_DIR` / `EVIDENCE_DIR`). |
| Several specs, one at a time | `ANDROID_SERIAL=emulator-5554 make run-many TARGET=android-emu EPS="ep01 ep04 ep16"` — stops on the first FAIL (exit 1) or locked / wrong device (exit 3). |
| Raw wdio | `ANDROID_SERIAL=… APPIUM_PORT=4727 ANDROID_SPECS=./specs/epaper/ep03-*.spec.ts npx wdio run wdio.android-emu.conf.ts` (iOS: `IOS_UDID=… APPIUM_PORT=4726 IOS_SPECS=… npx wdio run wdio.ios-real.conf.ts`). The config sets `TARGET`. |
| Leak scan | `npm run leak-scan` (prints booleans/file names only) |
| Allure | `make report RESULTS=allure-results-android-emu OUT=reports/allure-emu/html` · `make report-open OUT=reports/allure-emu/html PORT=5054` |
| Other | `make flake-report` (run history; empty until wired) · `make login-guard` (login-page form snapshot, GET only) · `make build APP_COMMIT=<sha> KIND=…` (needs `IOS_TEAM_ID` for `ios-device`) |

## 7. Results so far and skip reasons

| Run | Result |
|---|---|
| Android OnePlus, app 4.110.0-main-4806026 | **15 pass / 16 skip / 0 fail** (31 run; EP-06/13/15 not run) |
| iOS iPhone 17 (iOS 26.7.1), app 4.112.0 | **14 pass / 17 skip / 0 fail** (31 run; EP-06/13/15 not run) |
| Android emulator Pixel_10_Pro, origin/main 4.108.0 Debug | **15 pass / 0 fail** of the 15 Android-passing specs (17 tests, 15:44–15:59 IST). After the cleanup: relogin PASS + EP-01/04/16/21/28 **5/5 PASS** (16:25–16:34 IST). See [STATUS](docs/STATUS.md). |

A spec never fakes a pass: an unmet need ends in `SKIP:<reason>` (Allure label `skipReason`).

| Reason | Meaning |
|---|---|
| `FLAG_OFF` | Needs a feature flag state (e.g. `epaper_pdf_download_enabled=false`, EP-07) declared in `config/flags.override.json`; the framework never toggles flags. |
| `WOULD_LOGOUT` | Needs a logged-out device (EP-08); specs never log out the owner. |
| `GATED_BY_OPEN_QUESTION` | Blocked on an open question/input: min/excluded dates (EP-09/24), ≥2 regions (EP-19/30), a staging PDF contentId (EP-27). |
| `NOT_ON_PLATFORM` | Not applicable on this device: iPad-only (EP-10), tablet/Android-only (EP-29), portrait-locked phones (EP-23). |
| `PRECONDITION` | Start state or environment missing: already-downloaded edition that couldn't be cleared, not entitled / logged out, offline not approved, no throttling / SIM-only network, heavy multi-PDF cases, manual verdict (EP-34). |
| `FLAG_AMBIGUOUS` | Flag value couldn't be resolved for the account (Amplitude ids missing). |
| `INFRA:<kind>` | Not a skip — an infrastructure stop/failure (e.g. `INFRA:CONFIG`, `INFRA:SESSION`, `INFRA:CONTRACT`, `INFRA:LOGIN_CHALLENGE`, another app in front). Reported as a failure, never as a pass. |

**Parked specs.** Since 2026-10-29 16:38 IST every case outside the passing set (Android EP-01–05, 11, 12, 14, 16, 18,
20, 21, 22, 26, 28; iOS the same minus EP-16) is parked: `gate()` skips it up front with the typed reason from
[`specs/support/parked.ts`](specs/support/parked.ts) (Allure *skipped*, tag `parked`; never a pass). To run one again,
delete its entry, or set `RUN_PARKED=1` for all of them. The full list with reasons is in [STATUS](docs/STATUS.md#parked-specs-explicit-skips-rahul-1638-ist).

## 8. Current challenges and workarounds

| # | Challenge | Mitigation / workaround |
|---|---|---|
| 1 | **iOS notification banners / other apps coming to the front** (Slack, File Manager opened by a top-band tap). | `iosGuard`: front-app check before taps (one `activateApp`, then `INFRA` stop naming the app); SpringBoard banner check before any tap in the top 140 pt (wait ≤ 8 s or refuse); 1.5 s settle; back via `edgeSwipeBack` instead of the top-left button; turn on DND/Focus and switch off Slack etc. notifications. |
| 2 | **Developer certificate not trusted** ("Developer App Certificate is not trusted"). | On the phone: Settings › General › VPN & Device Management › Apple Development › Trust (once per new cert). |
| 3 | **WDA profile expires every 7 days** (personal team). Next expiry **2026-11-04 21:38 IST**. | Rebuild/re-sign WDA (`WDA_REBUILD` / xcodebuild build-for-testing with automatic signing) before then and re-trust if asked. TODO: add a doctor check for the expiry date. |
| 4 | **origin/main iOS Debug crashes on launch**: `assertionFailure()` at `InAppPurchasesImpl.swift:819` (productInfoMissing) via `IAPOfferSnapshot.resolve` ← `observeAndSyncUserAttributesToAirship`. | Suspected app bug (resolve() runs before StoreKit products load; Debug-only). Test released / TestFlight builds instead; report to the iOS team (TODO: owner/ticket). |
| 5 | **`-O` rebuild crashes the Swift compiler** (IRGen in `swift-issue-reporting` `SwiftTesting.swift:19`, with coverage flags). | Toolchain bug; don't build Debug with `SWIFT_OPTIMIZATION_LEVEL=-O`. TODO: try without coverage flags or a Release config. |
| 6 | **No match cert/key** for the Economist team. | Use automatic signing on the command line with your Xcode-managed team (CLI overrides only; never edit the app project). |
| 7 | **Android `:playerkit:demo` build failure** (root `assembleEconomistDebug`, `CacheKeyFactory` unresolved). | Build only the app: `./gradlew :app:assembleEconomistDebug`. Demo module, not the app. |
| 8 | **iOS app is portrait-only** (OrientationManager), phones portrait on Android. | EP-23 skips `NOT_ON_PLATFORM` before calling setOrientation; needs an iPad / Android tablet. |
| 9 | **Manage-only partial downloads** (`PARTIAL_DONE`). | Treated as "downloaded" in the start-state guard; never falls through to NOTHING. |
| 10 | **Edition already downloaded** on the owner device (all specs need "Download"). | With Rahul's OK, the start guard deletes it through the app's own Weekly › Delete and verifies NOTHING (watches for auto re-download). `PRESERVE_OWNER_DOWNLOADS=1` restores the never-delete rule (specs then SKIP). Keep auto-download off. |
| 11 | **WDA "max scroll count reached"** with `mobile: scroll`. | Incremental plain drags, checking after each (max 8). |
| 12 | **Slow thumbnail strip** (horizontal lazy list, only a few thumbs in the tree). | Swipe toward the target thumb step by step and re-query. |
| 13 | **Popups / interstitials** (newsletters, auto-download prompt, permissions, review, what's new, paywall…). | Handled centrally in `specs/support/popups.ts` (Android + iOS tables, hooks + `withPopupRetry`); unknown blockers are dumped to `reports/evidence/popups/`. New popup = one table row. |
| 14 | **adb `unauthorized`** after an emulator/adb restart (seen on Pixel_8, emulator-5556). | Accept "Allow USB debugging?" (tick Always allow); else toggle USB debugging in Developer options, or Cold Boot the AVD. TODO: root cause (adb-as-root / key mismatch) not confirmed. |
| 15 | **Emulator second user (private space, user 10)**. | `--user 0` on every install/pm call; never touch user 10 (§4). |
| 16 | **Offline specs EP-06/13/15** (and 31/32) toggle connectivity. | Waiting for Rahul's approval; opt in with `ALLOW_OFFLINE=1` or a dedicated device (`DEVICE_DEDICATED=1`). |
| 17 | **Missing inputs**: staging PDF contentId, multiple regions, network throttling, SIM-only network, iPad/tablet. | Gated with explicit skip reasons; opt-ins `PDF_STAGING_CONTENT_IDS`, `REGIONS`, `ALLOW_THROTTLE`, `HAS_SIM_ONLY_NETWORK`, `IS_IPAD`, `IS_TABLET`. |
| 18 | **Must not change content.** | Assert behaviour only; delete only downloads we made (`restore-own`); never flags, subscriptions, newsletters or logout in specs. |
| 19 | **Transient A&A download failure** seen once (EP-02 a4, Wi-Fi up). | Not reproduced; `restore-own` retries our own FAILED download once. Watch for it. |

## 9. Repo state

**Done:** L0 contract layer + unit tests; 34 EP specs; Android real/emulator and iOS real WDIO configs on a shared
`wdio.base.ts`; central popup handler; iOS guard; login script with relogin; parameterised runners (`scripts/run/`);
leak scan; runs on OnePlus, iPhone 17 and the emulator. Cleanup pass 2026-10-29: shared wdio base, runners moved out of
`reports/`, explore tools in `scripts/dev/`, per-port Appium pid/log, no Apple team / WDA bundle id code defaults,
uiautomator2 pinned (8.7.0), stale comments fixed, internal-only exports un-exported.

**Pending:** offline specs; gated specs' inputs (§8 #16–17); device registration in `config/devices.yaml`
(`make validate` exits 1 until then); RunHistory/flag readers in the wdio hooks; the `make smoke|p0|…` priority suites
(use `make run-many`); `login --target ios-sim`; CI (see `docs/FUTURE.md`).
Git: no commits yet; remote `origin` = `github.com/rahulkumar-teg/liskov-appium-e2e` (private).

## 10. Guardrails / safety rules

- Never print or commit secrets; `.env` stays 0600 and git-ignored; run `npm run leak-scan` before every push.
- One device per run, pinned by serial/UDID and allow-listed in the config; never use another bot's or person's device,
  the CI emulators (`Pixel_XL_CI*`), or reserved ports 4000/4003/4005/9090.
- Never `pm clear`, `--stop`-reset, uninstall the app, `adb kill-server`, or stop a process we didn't start
  (`appium-dev.sh` stops only the PID it recorded for that port).
- Android installs `--user 0` only; never touch the Work profile / private space.
- No mocks, no proxy, no flag toggling, no logout in specs (logout only in the relogin-gated login script).
- Popups: only dismiss/negative choices; never Subscribe, Upgrade, Allow, Turn on, or anything that changes the account.
- Condition waits only (no `.pause()`; enforced by lint).
- Don't edit `mobile-liskov`; build it only in a separate worktree.
