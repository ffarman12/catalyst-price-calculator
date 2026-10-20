# Cata-Logic / Eco Cat Catalyst Price Calculator — Project Handover

This document is the persistent handover note for future maintenance sessions. Read this first, then inspect the current `main` branch before making changes. This note is a guide, not a substitute for verifying the live code and backend.

## Main links

- **Editor Web App (GitHub Pages):** https://ffarman12.github.io/catalyst-price-calculator/
- **GitHub repository:** https://github.com/ffarman12/catalyst-price-calculator
- **Main branch:** `main`
- **Main frontend file:** `index.html`
- **Service worker:** `sw.js`
- **Supabase project reference:** `stakqodobksgmtzquhzs`
- **Viewer App:** planned; do not assume a complete Viewer frontend exists.
- **APK permanent download URL (expected after successful Release publish):** https://github.com/ffarman12/catalyst-price-calculator/releases/latest/download/Cata-Logic-Editor.apk
- **APK Releases page:** https://github.com/ffarman12/catalyst-price-calculator/releases
- **APK build workflow:** https://github.com/ffarman12/catalyst-price-calculator/actions/workflows/build-editor-apk.yml
- **Important:** The stable download URL works only after the GitHub Actions workflow successfully publishes a Release asset named `Cata-Logic-Editor.apk`. Check the latest workflow run and Releases page; do not claim it is available until the asset is visible. The workflow builds a debug-signed APK, not a Play Store production-signed APK.

## Owner's strict change rules

1. Do not change existing formulas, calculation logic, History behavior/data, database schema, storage keys, PIN/security, saved settings, UI, or working features unless the owner explicitly authorizes that specific change.
2. Do not delete, reset, migrate, or overwrite existing History/snapshot data.
3. Before a change that may affect a protected feature, explain the impact and ask for permission first.
4. Verify code from the current GitHub branch before editing. Never assume the deployed app or an API is working without testing.
5. Test the specific change and report what was and was not verified. Do not claim a test passed unless it actually did.
6. Never place API keys, service-role keys, or other secrets in frontend code or this document.

## App delivery model

- The Editor Web App is deployed through GitHub Pages.
- The Android APK is understood to be a Capacitor/WebView wrapper that loads the remote Editor page. Confirm this against the actual Android source/build configuration before relying on it.
- A change to the remote web page may reach the APK without rebuilding it if the APK loads that remote page and no bundled/native code changed. Native Android, Capacitor configuration, permissions, or bundled assets may require a new APK build.
- `.github/workflows/build-editor-apk.yml` builds a debug APK, uploads a short-retention Actions artifact as a backup, and is configured to publish `Cata-Logic-Editor.apk` to a GitHub Release. Verify the workflow run succeeded and the asset is present before sharing the stable download URL as working.
- The APK build workflow uses a generated Capacitor project; verify the workflow and its configuration before promising changes to native Android behavior.

## Important recorded commits

- APK/browser session behavior fix: https://github.com/ffarman12/catalyst-price-calculator/commit/cfbf00b4192596897a6a5413d606a58ac665c7eb
  - Recorded behavior: preserve browser refresh logout behavior while avoiding forced logout on native Capacitor cold start. Owner reported this worked.
- Manual/default cloud loading and save wiring: https://github.com/ffarman12/catalyst-price-calculator/commit/2b0403981d14da75576c4cc0c9db838320bbe54
- Live Market cloud-save wiring: https://github.com/ffarman12/catalyst-price-calculator/commit/affde089ee1eabb9df00c2cdb448b6593b5a759f
  - Note: actual MetalpriceAPI end-to-end verification was blocked by exhausted API quota at the time recorded. Re-test when quota is available.
- Viewer market source control labels/state: https://github.com/ffarman12/catalyst-price-calculator/commit/97e5077a068a2938eecb970e9a0aed41f87e5850
- Latest recorded JavaScript syntax repair for Viewer controls: https://github.com/ffarman12/catalyst-price-calculator/commit/691baa325758e005c3559a9b6ee346ee00223f66
  - Owner subsequently reported the app/tabs were working again. Recheck current branch before further edits.
- Permanent APK release workflow configuration: https://github.com/ffarman12/catalyst-price-calculator/commit/617e823fa853fb1eebfd772ecf226165af48d613

## Supabase / market architecture recorded so far

Project reference: `stakqodobksgmtzquhzs`

Recorded tables:
- `market_history` — market snapshots/history. Preserve existing rows.
- `market_manual_state` — current Manual Market cloud state.
- `market_default_state` — Default Market used for History/refine calculation defaults.
- `market_live_state` — current Live Market cloud state.
- `viewer_market_control` — Viewer market source selection.
- `app_settings` — persistent application settings (including recorded Less History settings).

Recorded Edge Functions:
- `metalprice-market` — server-side MetalpriceAPI access. The API key must remain server-side.
- `market-manual-save`
- `market-default-save`
- `market-live-save`
- `viewer-market-control`
- `viewer-market-feed`

Architecture notes:
- `market-live-save` was recorded as active and stores a single current Live Market record in `market_live_state` (id=1), validating pt/pd/rh/usd and checking readback.
- `viewer-market-feed` was recorded as a GET-only feed that reads `viewer_market_control` and then selects either `market_manual_state` or `market_live_state`. It does not read `market_history`.
- Viewer market source control semantics: **ON = Manual Market cloud**; **OFF = Live API cloud**. This is separate from the Default Market used for History calculations.
- Verify the current deployed function code, settings, and database schema before making backend changes. Do not include secrets in logs or handover notes.

## History / Less History requirements

- Viewer History calculations must follow the Editor's established calculation logic, not a newly invented formula.
- History calculations use the saved Editor Default Market.
- Use Editor-saved Pt/Pd/Rh percentages and the Less History preference according to the agreed behavior below.
- The Viewer Live Market source toggle is separate from the Default Market used for History calculations.
- Keep all cloud History and snapshot data intact.
- Recorded Less History control requested under Editor 3-dot menu > Viewer Command:
  - **Blue tick / “Excel mode on”** means do not apply Less percentages to Viewer History.
  - **No tick** means apply the Editor-saved Pt/Pd/Rh Less percentages to Viewer History.
- This Viewer History calculation behavior still needs to be implemented and tested in the Viewer frontend if it has not been completed. Do not assume it is already active.
- Editor local settings referenced in previous inspection include `cat_less_history_rates`, `cat_less_history_disabled`, `cat_less_history_state_v2`, and `cat_less_settings`. Verify current source before relying on these keys.

## Market refresh and snapshots — recorded requirements

- Live Market auto-refresh schedule requested: weekdays at 08:00, 11:00, 14:00, 17:00, and 21:00 local time.
- Live market auto-refresh should be disabled on Saturday and Sunday.
- Snapshots should still be saved on weekends and at scheduled times even if the app is closed; server-side scheduling is required for this.
- Snapshot values should be the Manual Market values at snapshot time and should be used for History/refine defaults as agreed.
- These requirements and the actual deployed scheduler must be verified independently; do not claim server-side scheduling exists unless its implementation is found and tested.
- Do not add frequent 5-minute API polling; the MetalpriceAPI quota is limited.

## Viewer feature plan (read-only)

Planned Viewer permissions/features:
1. View Live Market card.
2. View Graph card.
3. No Manual Market card.
4. Use Refine Calculator.
5. Refine Calculator Excel mode only if enabled by Editor.
6. Search History.
7. No History edit/delete.
8. View ppm according to Editor permission.
9. Login only in the 3-dot menu; no other Editor options.
10. Notifications.

The Viewer frontend remains a separate pending work item unless the current repository proves otherwise.

## Safe update checklist

1. Read this file and inspect the current `main` branch, latest commit, and deployed page.
2. Identify the exact requested change and affected files/functions.
3. Check whether it could affect a protected feature; ask for permission first if so.
4. Make the smallest scoped change; preserve unrelated code and all existing cloud data.
5. Run syntax/static checks and targeted tests; inspect the diff.
6. Commit with a clear message and link.
7. Verify the deployed Web App. Test the APK separately when the relevant APK/build artifact is available.
8. Report the exact commit, what changed, what was tested, and any tests blocked by missing API quota, credentials, APK source, or device access.

## Missing items to fill in

- Confirm that the latest APK Release workflow completed successfully and that its asset is downloadable.
- Location/link for the Android Capacitor source project and build instructions.
- Confirmation of the latest deployed Edge Function code and any server-side snapshot scheduler.
- Viewer frontend repository/path and implementation status.
