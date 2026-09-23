# Developing AnythingLLM Mobile

Everything you need to build, run and release the app locally. For what the app does, see the [README](./README.md).

## Prerequisites

- Node.js >= 18
- Yarn
- React Native development environment ([setup guide](https://reactnative.dev/docs/environment-setup))
- Android SDK (for Android builds)
- Xcode (for iOS builds, macOS only)

## Getting Started

```bash
# Install dependencies
yarn install

# Start Metro bundler
yarn start

# Run on Android
yarn android

# Run on iOS (macOS only)
cd ios && pod install && cd ..
npx react-native run-ios
```

## On-device runtime (llama.rn)

On-device inference uses [llama.rn](https://github.com/mybigday/llama.rn), which requires the React Native
**New Architecture** (`newArchEnabled=true` in `android/gradle.properties`). During `yarn install` its
postinstall script downloads the prebuilt `librnllama*.so` libraries from the matching GitHub release into
`node_modules/llama.rn/android/src/main/jniLibs`.

If that download fails (no network, or on Windows when `yarn` runs inside Git Bash where GNU `tar` mis-reads
the `C:` drive letter as a remote host) re-run it from PowerShell / cmd:

```bash
node ./node_modules/llama.rn/install/download-native-artifacts.js --force
```

On-device inference is CPU-only by design. GPU and NPU offload paths were removed after measuring them slower
than CPU on the devices we target, so please do not reintroduce them.

## Building for Release

1. Place your `anythingllm-upload-key.keystore` in `android/app/`
2. Set `APP_RELEASE_STORE_PASSWORD` and `APP_RELEASE_KEY_PASSWORD` environment variables
3. Run `yarn build:android:release`
4. Output will be in the `release/` folder

Before cutting a release, bump the version in `package.json`, `.version` and `android/app/build.gradle`
(`versionCode` and `versionName`) and add an entry to `src/utils/changelog.ts`. The in-app
"What's new" modal looks up the entry that matches the installed `versionName`.

## Technical Overview

This is a React Native application targeting Android (with iOS support planned). Key technologies:

- **React Native 0.81** (bridgeless, New Architecture) — Core framework
- **NativeWind / Tailwind CSS** — Styling
- **MobX** — State management
- **WatermelonDB** — Local database
- **llama.rn** — On-device LLM inference (llama.cpp bindings)
- **React Navigation** — Routing and navigation

### Project Structure

```
src/
├── components/     # Reusable UI components
├── contexts/       # React contexts
├── database/       # WatermelonDB models & schema
├── hooks/          # Custom React hooks
├── quickContext/   # "Ask with AnythingLLM" text-selection card (second React root)
├── screens/        # App screens
├── services/       # Business logic & API services
├── store/          # MobX stores
└── utils/          # Utilities, tools, AI provider implementations
```

### Android entry points

Besides `MainActivity`, the Android app exposes two system integrations, both under
`android/app/src/main/java/com/anythingllm/`:

- **Share sheet** — `MainActivity` accepts `ACTION_SEND` / `ACTION_SEND_MULTIPLE` for images, documents and
  links; `src/utils/SharedContent` turns them into chat attachments.
- **Text selection toolbar** — `quickcontext/QuickContextActivity` handles `ACTION_PROCESS_TEXT` and renders the
  `AnythingLLMQuickContext` React root registered in `index.js` on the shared React host. The entry can be
  disabled from Settings › Special tools, which toggles the activity component through `PackageManager`.

## Contributing

- Create issues for bugs or feature requests
- PRs are welcome — please follow existing code style and run `yarn lint` before submitting
- Contributors must sign our [Contributor License Agreement](./CLA.md) — a bot will prompt you on your first pull request
