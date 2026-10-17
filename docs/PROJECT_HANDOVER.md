# Cata-Logic / Eco Cat Catalyst Price Calculator — Project Handover

Last updated: 2026-10-17

This document is the durable handover record for future ChatGPT conversations. Always inspect the current GitHub source and relevant Supabase configuration before making changes; this document is context, not proof that every feature is currently working.

## Main links

- Editor Web App: https://ffarman12.github.io/catalyst-price-calculator/
- GitHub repository: https://github.com/ffarman12/catalyst-price-calculator
- Main branch: `main`
- Main app file: `index.html`
- Service worker: `sw.js`
- Supabase project ref: `stakqodobksgmtzquhzs`
- Supabase URL: `https://stakqodobksgmtzquhzs.supabase.co`

## Non-negotiable change rules

1. Do not change existing features, formulas, calculations, settings, History, database schema/data, storage keys, UI/design, PIN/security, or working logic without the user's explicit permission.
2. Do not delete/reset/migrate existing History or cloud data.
3. Do not claim something was tested unless it was actually tested. Verify GitHub code and, where possible, live/backend behavior separately.
4. Before any change that may affect an existing feature, formula, setting, History, database, UI, design, or security flow, explain the risk and obtain permission.
5. Keep any APK/Android wrapper and its build configuration separate from the existing Web App source. Do not modify `index.html`, `sw.js`, `manifest.webmanifest`, or current web icons as part of APK setup unless explicitly approved.
6. Never put the MetalpriceAPI key or Supabase service-role key in browser code, an APK, or public files.

## Web and APK plan

- The Web App remains the main application/source of truth.
- The planned APK should load the hosted Web App URL so it receives website updates when online, rather than maintaining a separate copy of the application UI/code.
- APK setup/build files should be stored in a clearly separate folder/workflow in this repository.
- Web and APK should use the same Supabase cloud History. A History entry saved in one should be visible in the other if the existing cloud save/load path is functioning. Verify this on actual devices before claiming full parity.
- Local device/browser storage may not be shared between Web and APK; cloud-backed History is the intended shared record.
- Do not claim that an APK exists or is verified until a build has succeeded and the APK has been checked. A debug APK is for sideload testing, not a signed Play Store release.
- A distinctive APK launcher icon can be added separately. Do not replace the existing Web App icon without approval.

## Market data and snapshot rules

- Market API Edge Function: `metalprice-market`; the MetalpriceAPI key is stored server-side as a secret.
- Related Edge Functions: `market-manual-save`, `viewer-market-control`.
- Relevant tables: `market_manual_state`, `market_history`, `market_refresh_requests`, `market_live_state`, `viewer_market_control`.
- The user has reported the MetalpriceAPI monthly quota was exceeded and a direct API test returned 502. Treat live API availability as unverified/unavailable until a real test succeeds; never assume it is working.
- Live Market refresh and History snapshot jobs are separate. A live refresh must not itself create a History snapshot.
- Rhodium (Rh) is not returned by the API; preserve the existing manual Rh value during a live refresh.
- Manual Market values are the source for scheduled History snapshots and the Editor app's relevant default/history/refine behavior, according to the existing design. Do not alter the separate Editor Default Market.
- Snapshots should be saved server-side even when the app/browser is closed, on all days, at 10:00, 14:00, 18:00, and 22:00 IST. Save the scheduled slot even if values have not changed; do not add extra snapshot times.
- Live refresh schedule: Monday–Friday at 08:00, 11:00, 14:00, 17:00, and 21:00 IST.
- Existing cron jobs were reported as configured for these schedules; inspect current Supabase cron state before changing or asserting current status.
- The API quota issue means schedules alone do not guarantee successful fresh market data.

## Viewer Live Market source selector

- This is an Editor 3-dot menu > Viewer Command feature, PIN-protected through the existing menu/section-unlock flow.
- ON means Viewer App Live Market uses the Supabase Manual Market record (`market_manual_state`).
- OFF means Viewer App Live Market uses the latest Live Market record (`market_live_state`).
- Default setting is OFF / `live`.
- Edge Function: `viewer-market-control`; it should use service-role credentials only server-side.
- `market_live_state` stores one latest successful live record, not a historical series. It may be empty until an API fetch succeeds; Viewer must handle missing data gracefully.
- Viewer App has not yet been built; no Viewer repository has been supplied.

## Viewer App planned access

Viewer is intended to be read-only with these permissions:
- View Live Market and Graph.
- Use Refine Calculator.
- Use Refine Calculator Excel mode only if enabled by Editor.
- Search History.
- View PPM only with Editor permission.
- Notifications available.
- No Manual Market card and no History edit/delete controls.
- Login only in the 3-dot menu; other Editor settings are not exposed.
- History should use cloud snapshots; history/refine calculations should follow the Editor's established default/formula behavior. Do not change Editor formulas.

## Fixed UI decisions and known protected areas

- Refine Calculator Excel mode remains; “Less Refine” was removed.
- Manual Market preferred styling: soft blue background `#EAF3FF`, border `#C6DDF8`.
- PPM card positioning, including known CSS/position rules such as `const top=65;` and `right:-28px!important;`, must not be altered without permission.
- Photo section height is 410px; do not change without permission.
- Do not disturb white side panels, “Model Details” label, History photo layout, PPM placement, menu ordering, or existing lock/PIN behavior without approval.
- Existing menu order was specified as Account, Profile, Password Settings, Menu, Viewer Command.
- Graph date range was changed from 2 Years to 1 Year. Previous Market Records date selection is also limited to the last 1 year.

## Recent known commits

- `16fda08ad659570d89f24c2c0ce9931cbe87629c`: Graph range and Previous Market Records date range changed to 1 year.
- `9a56ebfdaeae7fe0027e02e849054c463db6411e`: Viewer Command moved to a top-level folder and Section Lock option added.
- `5662b81181d793bb9eaf74a4db71e8d5a8fc0874`: Initial Viewer Live Market source toggle.
- A later inspected `index.html` SHA was reported as `6f3bf07070a47e200025bf5f1637558a5779a541`. Always verify the actual current branch head; do not assume this is still latest.

## Testing expectations

For each change:
1. State exactly which files and behavior will change.
2. Keep the diff limited to the approved scope.
3. Inspect the final diff and current GitHub source.
4. Test the specific change where possible; distinguish code inspection from live/device testing.
5. For market changes, test the real Edge Function/API and verify whether cloud save succeeded; do not infer success from UI alone.
6. For Web/APK History parity, test saving a record from each version and confirming it appears in the other.
7. Never reset or seed History data as a shortcut.

## How to continue in a new ChatGPT chat

Tell ChatGPT: “Continue the Cata-Logic / Eco Cat Catalyst Price Calculator project. First read `docs/PROJECT_HANDOVER.md` and inspect the current `main` branch before proposing or making changes. Follow the strict no-unapproved-changes rules. Do not assume the MetalpriceAPI works; test it. Keep APK build files isolated from the Web App. Explain risks and ask permission before touching protected features, formulas, settings, History, database, UI/design, or security.”
