# liskov-appium-e2e — `make help` lists targets. Device runs: `make run-one` / `make run-many` (scripts/run/, README §6).
# The priority-suite targets (smoke/p0/…) are not wired yet and stop after contract → validate.
SHELL := /bin/bash
NPM   := npm run -s

.PHONY: help install doctor typecheck lint unit contract validate check \
        contract-mutations smoke p0 p1 offline nightly nightly-heavy epaper build report locks locks-purge \
        flake-report login-guard login run-one run-many flags-init \
        leak-scan report-open appium-start appium-stop appium-status

help: ## this list
	@echo "liskov-appium-e2e targets (see README.md):"
	@grep -E '^[a-z][a-z0-9 -]*:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  %-22s %s\n", $$1, $$2}'

install: ## npm ci (pinned lockfile)
	npm ci

doctor: ## version pins (read-only; never invokes adb)
	./scripts/doctor.sh

typecheck: ## tsc --noEmit (strict)
	$(NPM) typecheck

lint: ## eslint (bans .pause(), .reveal() outside secrets, expect on pHash/OCR)
	$(NPM) lint

unit: ## framework unit tests (no device)
	$(NPM) test:unit

contract: ## L0 contract suite vs LISKOV_REPO (no device, no Appium)
	@test -n "$$LISKOV_REPO" || grep -qs '^LISKOV_REPO=.' .env || { echo "INFRA:CONTRACT set LISKOV_REPO (read-only mobile-liskov checkout)"; exit 2; }
	$(NPM) test:contract

contract-mutations: ## prove the contracts fail on known-breaking source edits (temp copy; LISKOV_REPO untouched)
	npx tsx scripts/contract-mutations.ts

validate: ## dry run: config, devices, flags, secrets refs, locks (no device)
	$(NPM) validate

check: typecheck lint unit contract ## everything that runs without a device

smoke p0 p1 offline nightly nightly-heavy epaper: contract validate ## priority suites (not wired yet; use run-many)
	@echo "INFRA:CONFIG '$@' is not wired yet — use make run-many TARGET=… EPS=\"ep01 ep02 …\". Contract and validate passed; stopping here."; exit 78

run-one: ## one spec: make run-one TARGET=android-emu EP=ep01 [ATTEMPT=1] (ANDROID_SERIAL / IOS_UDID from env)
	@test -n "$(TARGET)" -a -n "$(EP)" || { echo "usage: make run-one TARGET=android-real|android-emu|ios-real EP=ep01"; exit 2; }
	bash scripts/run/run-one.sh $(TARGET) $(EP) $(or $(ATTEMPT),1)

run-many: ## specs in sequence, stop on FAIL/LOCKED: make run-many TARGET=android-emu EPS="ep01 ep04"
	@test -n "$(TARGET)" -a -n "$(EPS)" || { echo "usage: make run-many TARGET=… EPS=\"ep01 ep04 …\""; exit 2; }
	bash scripts/run/run-many.sh $(TARGET) $(EPS)

build: ## build mobile-liskov at a commit: make build APP_COMMIT=<sha> KIND=android|ios-sim|ios-device
	bash scripts/build-from-commit.sh

report: ## allure report: make report [RESULTS=allure-results] [OUT=reports/allure]
	@d=$(or $(RESULTS),allure-results); if [ -d "$$d" ]; then npx allure generate "$$d" -o $(or $(OUT),reports/allure) --clean; else echo "no $$d/ yet"; fi

report-open: ## serve a generated report: make report-open [OUT=reports/allure] [PORT=5054]
	npx allure open $(or $(OUT),reports/allure) -p $(or $(PORT),5054)

leak-scan: ## scan reports/docs/src/… for any .env secret value (prints booleans + file names only)
	npx tsx scripts/secret-leak-scan.ts

appium-start appium-stop appium-status: ## our Appium only (APPIUM_PORT=4725|4726|4727); stops only its own PID
	bash scripts/appium-dev.sh $(subst appium-,,$@)

locks: ## list device locks / account leases / build locks
	npx tsx scripts/locks-doctor.ts

locks-purge: ## remove STALE locks only (leases via sweep(): serial accounts get the A4 dirty marker)
	npx tsx scripts/locks-doctor.ts --purge-stale

flake-report: ## flaky cases from ~/.liskov-appium/history.db (read-only; empty until runs record history)
	npx tsx scripts/flake-report.ts

login: ## Log in via the app UI (user1 default): make login TARGET=android-emu SERIAL=emulator-5554 [ACCOUNT=user1] [PORT=4727] [RELOGIN=1|0]
	npx tsx scripts/login.ts --target $(or $(TARGET),android-emu) $(if $(SERIAL),--serial $(SERIAL),) $(if $(UDID),--udid $(UDID),) --account $(or $(ACCOUNT),user1) --port $(or $(PORT),4727) $(if $(RELOGIN),$(if $(filter 1,$(RELOGIN)),--relogin,--no-relogin),)

login-guard: ## login-page form snapshot check (GET only, never submits): make login-guard [ENV=stage|prod]
	npx tsx scripts/login-page-guard.ts --env $(or $(ENV),stage)

flags-init: ## create config/flags.override.json from the example (never overwrites)
	$(NPM) flags:init
