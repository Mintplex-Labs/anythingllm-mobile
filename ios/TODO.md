# iOS port: status and remaining work

The app builds and runs on the iOS simulator (Xcode 26, RN 0.81, New Architecture). This file
tracks everything known to be missing or different on iOS. Tick items off as they land.

## Local setup

- `brew install cocoapods`, then `cd ios && pod install`
- `yarn start`, then build the `AnythingLLM` scheme for a simulator (or
  `xcodebuild -workspace ios/AnythingLLM.xcworkspace -scheme AnythingLLM -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO build`)
- Optional files, both are copied only when present:
  - `ios/GoogleService-Info.plist`: without it Firebase (Analytics + Crashlytics) is off
  - `src/assets/fonts/ClashDisplay-Medium.ttf`: licensed, see `scripts/checkBrandFonts.js`

## Blocked on account setup

- [ ] Decide the bundle ID. The Xcode project uses `ai.AnythingLLM`; `ios/fastlane/Fastfile` and
      `Matchfile` use `ai.anythingllm`. Make all three match what is registered in App Store Connect.
- [ ] Register the iOS app in Firebase and add `ios/GoogleService-Info.plist` (Android's
      `google-services.json` is committed, so this can be too).
- [ ] Enable `increased-memory-limit` and `extended-virtual-addressing` on the App ID, then add an
      `.entitlements` file to the app target. On-device models need the extra memory.

## Core features broken until ported

These Android native modules have no iOS version, and nothing in JS guards them.

- [x] **VectorBox** (RAG / embedded documents, `src/utils/VectorDB.ts`): the biggest item. Port
      to ObjectBox Swift (HNSW), or move both platforms to op-sqlite + sqlite-vec. Keep the JS
      interface and the 768-dim assumption.
- [x] **PdfParserModule** (PDF uploads, `src/utils/PDFParser.ts`): PDFKit, `PDFDocument.string`
      per page. Keep the Android error codes.
- [x] **WebScraperModule** (web scraping + summarize-URL tools): a hidden `WKWebView` attached to
      the window off-screen, then `document.body.innerText` after load settles. 30s timeout.

## Needed before a TestFlight build is usable

- [x] Toasts: `src/utils/Notification` uses `ToastAndroid` (~98 call sites, silent on iOS).
      Needs a cross-platform toast.
- [x] Info.plist:
  - [x] add calendar keys (`NSCalendarsFullAccessUsageDescription`,
        `NSCalendarsWriteOnlyAccessUsageDescription`, `NSCalendarsUsageDescription`)
  - [x] add `NSLocalNetworkUsageDescription` (LAN Ollama / LM Studio / Desktop)
  - [x] remove the empty `NSLocationWhenInUseUsageDescription`: `getLocation` is IP-based, and
        App Review rejects empty purpose strings
  - [x] portrait-only on iPhone, to match Android
- [ ] On-device models:
  - [x] Enable Metal on device: `ModelStore.useMetal` is false and the providers hardcode
        `n_gpu_layers: 0`. Keep the CPU fallback for the simulator.
  - [x] Budget against the per-app limit in `memoryFit` (`deviceMemory.ios.ts`).
        `useMemoryCheck` already reads `os_proc_available_memory()` through `DeviceInfoModule`.
  - [ ] Same for `contextLength`.
  - [x] `use_mlock: false` on iOS.
  - [x] Stop inference and unload models when the app goes to the background
        (`useReleaseModelsInBackground.ios.ts`).
- [ ] Storage:
  - [ ] Move models, `processed/` and `generated-documents/` from Documents to Application
        Support. Documents is visible in the Files app (`UIFileSharingEnabled`) and gets backed
        up to iCloud. Keep only `Exports/` in Documents.
  - [ ] Check that picked files (`file://` URIs) can be read by RNFS on iOS (`useAttachments`).
- [ ] Downloads (`DownloadManager.startIOSDownload`): uses `background: false`, and active
      downloads aren't restored after relaunch. `useModelManager` downloads already use
      `LARGE_DOWNLOAD_SESSION_OPTIONS`.
- [ ] Settings → version check points at the Play Store (`paths.ts` `google_play_store`).
      Hide it on iOS, or link to the App Store.
- [ ] Back navigation: `BackHandler` does nothing on iOS. Check that every screen using
      `useHighjackBackButtonPress` has a visible back control.
- [ ] Keyboard: only some screens use `KeyboardAvoidingView`. Check every screen with a
      `TextInput`.
- [ ] Status bar style on iOS (`App.tsx` uses `barStyle='default'`).
- [ ] Fonts: `theme.ts` and `UIAppFonts` reference Inter, which isn't in the repo (Android ships
      PlusJakartaSans). Sort fonts out on both platforms.
- [ ] Verify WatermelonDB with JSI on (currently off on both platforms) before turning it back on.

## Platform features, reworked for iOS

- [ ] AnythingLLM server: add `"ios"` to `validDeviceOs` in `server/models/mobileDevice.js`.
      Until then iOS pairing fails with "Invalid device OS - ios".

- [ ] Draft text / email / calendar: native module wrapping `MFMessageComposeViewController`,
      `MFMailComposeViewController` (fall back to `mailto:`) and `EKEventEditViewController`.
      Today iOS uses the share sheet, `mailto:` and a direct EventKit save. The Messages and Mail
      sheets can't be tested in the simulator.
- [ ] Share to AnythingLLM: a Share Extension + App Group, for Photos, Safari URLs and text.
      "Open in…" from Files already works through `SharedContentModule`.
- [x] Reminders: local notifications within 24 hours, calendar events beyond.
- [ ] Reminders: AlarmKit on iOS 26+ (`NSAlarmKitUsageDescription`), so reminders ring like real
      alarms and can be changed in the Clock app.
- [ ] Scheduled jobs: best-effort `BGTaskScheduler` (`UIBackgroundModes` +
      `BGTaskSchedulerPermittedIdentifiers`), plus a due-time local notification. Today jobs
      run in the foreground only. Background runs can't use the GPU.
- [ ] `ScreenLockModule.isLocked` is a heuristic on iOS. Because of background suspension, the
      "reply finished while locked" notification will rarely fire.

## Cut on iOS (no platform equivalent)

- Device assistant: no default-assistant role, assist gesture, overlay or screenshot of other
  apps. Possible substitute: App Intents / App Shortcuts ("Ask AnythingLLM" via Siri, Spotlight,
  the Action button, a Control Center button).
- Quick Actions (`PROCESS_TEXT` selection-toolbar entry). Possible substitute: an Action Extension
  in the share sheet.
- Choosing a messaging, email or calendar app from a list (iOS can't list installed apps).
- Battery-optimization exemption, and enabling/disabling system integrations from inside the app.

## Release pipeline

- [ ] Gemfile: pin Ruby to something installable (or use `.ruby-version`), and adopt the RN 0.81
      template pins (`xcodeproj < 1.26`, `concurrent-ruby < 1.3.4`).
- [ ] Add `ios`, `pods` and `clean:ios` scripts to `package.json`.
- [ ] Crashlytics dSYM upload phase, and keep `main.jsbundle.map` per build (like
      `scripts/buildAndroidRelease.js` does for Android).
- [ ] GitHub Actions macOS workflow that runs `ios/fastlane` `release_ios_testflight`. It needs
      the `match` repo and these secrets: `GOOGLE_SERVICES_PLIST`,
      `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_API_KEY_ISSUER_ID`,
      `APP_STORE_CONNECT_API_KEY_CONTENT`, `MATCH_GITHUB_TOKEN`, `MATCH_PASSWORD`.
- [ ] App Store listing: screenshots (6.9" and 6.5" iPhone, plus iPad if iPad stays supported),
      privacy nutrition labels (Firebase Analytics/Crashlytics), review notes.
- [ ] Remove the stale `ios/PrivacyInfo.xcprivacy`. The one in use is
      `ios/AnythingLLM/PrivacyInfo.xcprivacy`.
- [ ] Update `DEVELOPMENT.md` and `README.md` (the "iOS" roadmap checkbox).
