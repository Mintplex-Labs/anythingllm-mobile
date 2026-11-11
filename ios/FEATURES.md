# iOS feature support

What the iOS app supports compared to Android, and why anything is missing. Update this file whenever a
feature lands, changes or is cut on iOS. Open work items live in [TODO.md](TODO.md).

**Status:** ✅ supported · 🟡 partial (see notes) · ❌ not supported on iOS · ⏳ planned

## How iOS code is kept separate

- **Native code** lives only in `ios/AnythingLLM/`. When an Android native module has an iOS twin, both
  register the same module name and expose the same methods, so the shared JS that calls them is identical
  on both platforms (e.g. `VectorBox`, `PdfParserModule`, `WebScraperModule`).
- **JS that differs per platform** goes in a platform file: `foo.ios.ts` next to `foo.ts`. Metro picks the
  `.ios` file on iOS; the unsuffixed file is what Android runs. Never put iOS logic in the unsuffixed file.
- `Platform.OS` may stay inline only for:
  - guards that turn off an Android-only feature on iOS (device assistant, Quick Actions, background
    scheduler, notification channels and progress notifications, listing installed apps)
  - data that differs per platform but runs through the same code (the model catalog, picker file
    types, highlight cards, the OS name sent to the server)
  - layout props (e.g. `KeyboardAvoidingView` behavior) and diagnostics
- Current platform pairs: `src/utils/reminderDelivery`, `src/utils/calendarView`,
  `src/utils/fs/deviceLocation`, `src/utils/models/deviceMemory`, `src/utils/models/runtime`,
  `src/utils/Notification`, `src/hooks/useReleaseModelsInBackground`,
  `PromptInput/sheetLayout`, `DraftCards/openDraft` and `FileDownloadCard/saveFile`.

## Chat and models

| Feature | Status | Notes |
| --- | --- | --- |
| Chat with cloud / remote providers (OpenAI, Anthropic, OpenRouter, Ollama, LM Studio, ...) | ✅ | Same JS as Android. LAN providers need the Local Network permission (prompted on first use). |
| Streaming, thinking, citations, message actions, threads, forking | ✅ | |
| On-device chat models (llama.rn, GGUF) | 🟡 | Runs on Metal on devices, CPU in the simulator (`src/utils/models/runtime.ios.ts`). Unloaded as soon as the app goes to the background, and a reply still generating stops where it got to (iOS suspends the app and allows no GPU work there). It loads again on the next message. Android keeps generating in the background. |
| "Recommended" model and memory-fit badges | ✅ | Measured against the per-app memory limit (`os_proc_available_memory` plus the current footprint), not total RAM (`src/utils/models/deviceMemory.ios.ts`). The simulator has no limit and uses the Mac's RAM. |
| Image support for vision models (mmproj) | ✅ | Same as Android: not downloaded with the model, offered from the attachments sheet the first time it is needed. |
| On-device embedder and rerankers | ✅ | Same llama.rn runtime options as chat. |
| Model downloads | 🟡 | Foreground `URLSession` downloads. They do not resume after the app is killed (Android uses WorkManager). |
| MLX models (mlx-serve parity) | ⏳ | Long-term: MLX Swift provider next to llama.rn. |
| Connect to AnythingLLM Server / Desktop (import workspaces) | 🟡 | QR pairing, approval, workspace sync and chat all work. **Needs a server change:** `server/models/mobileDevice.js` only accepts `deviceOs: "android"`, so pairing fails with "Invalid device OS - ios" until `"ios"` is added to `validDeviceOs` (the server's Mobile Connections page already shows an iOS icon). The simulator has no camera, so scanning itself is only testable on a phone. |
| ChatGPT sign-in | ✅ | `LoopbackAuthModule` (iOS). |

## Documents and RAG

| Feature | Status | Notes |
| --- | --- | --- |
| Embedding documents into a workspace (vector search) | ✅ | `ios/AnythingLLM/VectorBox.m`: SQLite + exact cosine search with Accelerate. Android uses ObjectBox HNSW. Same scores (cosine distance). |
| PDF uploads | ✅ | `ios/AnythingLLM/PdfParserModule.m` (PDFKit). Same result shape and error codes as Android. |
| Other document types (docx, xlsx, txt, ...) | ✅ | Pure JS parsers, shared. |
| Image attachments | ✅ | |

## Tools (agent skills)

| Tool | Status | Notes |
| --- | --- | --- |
| Web search | ✅ | Shared JS. |
| Web scraping / summarize URL | ✅ | `ios/AnythingLLM/WebScraperModule.m`: hidden `WKWebView`, same 30s timeout and settle delay as Android. |
| Current time, location | ✅ | Location is IP-based on both platforms; no location permission. |
| Create files (docx, xlsx, pptx, pdf, ...) | ✅ | Saved to the app's `Exports/` folder, visible in the Files app. |
| Draft text message | 🟡 | Opens the share sheet. Picking a messaging app from a list is not possible on iOS. |
| Draft email | 🟡 | Opens `mailto:` (the default mail app). Falls back to the share sheet when no mail app is installed, e.g. the simulator. Picking an email app from a list is not possible on iOS. |
| Create calendar event | 🟡 | Saved directly with EventKit when the card is tapped. Picking a calendar app is not possible on iOS. |
| Read calendar events | ✅ | EventKit via `react-native-calendar-events`. |
| Set reminder / alarm / timer | 🟡 | Within 24 hours: a scheduled local notification (`src/utils/reminderDelivery.ios.ts`) that iOS delivers even when the app is closed. Android puts an alarm or timer in the clock app instead. Further out: a calendar event with an alert, same as Android. Notification reminders can't be opened or changed from the card, since iOS apps can't set Clock alarms before AlarmKit (iOS 26+, ⏳). |
| Scheduled jobs | 🟡 | Run while the app is open. iOS does not allow arbitrary background execution, so jobs that come due while the app is closed run the next time it opens. |

## System integrations

| Feature | Status | Notes |
| --- | --- | --- |
| Toasts | ✅ | `ios/AnythingLLM/ToastModule.m` + `src/utils/Notification/index.ios.ts`. |
| Push notifications (reply finished, job finished) | 🟡 | Work while the app is running. "Reply finished while locked" rarely fires because iOS suspends the app soon after it is backgrounded. |
| Open files shared from other apps ("Open in…") | ✅ | `SharedContentModule` (iOS). |
| Share sheet target (share text / URLs / photos into the app) | ⏳ | Needs a Share Extension + App Group. |
| Device assistant (default assistant, assist gesture, overlay) | ❌ | iOS has no assistant role for third-party apps. Possible substitute: App Intents / Siri Shortcuts. |
| Quick Actions ("Ask with AnythingLLM" on selected text) | ❌ | No `PROCESS_TEXT` equivalent. Possible substitute: an Action Extension in the share sheet. |
| Choosing which messaging / email / calendar app to use | ❌ | iOS can't list installed apps. |
| Battery-optimization exemption, toggling system integrations | ❌ | No iOS equivalent. |
| Launch screen | ✅ | App icon centered on `#131314`, matching the Android 12+ system splash (`splash_background` + launcher icon). |
| Feature highlights tour | 🟡 | Device assistant, Quick Actions, share sheet and scheduled-jobs cards are Android-only. |

## Out of scope for now

Speech-to-text, image generation and other on-device media features are not part of the iOS port.
