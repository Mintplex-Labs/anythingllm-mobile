# AnythingLLM Mobile

## External file requirements

- `anythingllm-upload-key.keystore` in `android/app`
- Fill out `APP_RELEASE_STORE_PASSWORD` and `APP_RELEASE_KEY_PASSWORD` in root level `.env` file.

## How to release

1. Commit all changes and confirm functionality
2. Bump version + update build number

```
.version
android/app/build.gradle
ios/PocketPal.xcodeproj/project.pbxproj
 package.json
```

3. `yarn build:android:release`
4. Writes output to release folder
5. Upload new release to legacy folder on CDN
6. Download and QA build from CDN build -> confirm functionality
7. Upload `anythingllm-mobile.aab` to Google Play on new release track
8. Wait for prod release 