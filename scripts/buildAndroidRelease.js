const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read package.json to get version
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;

console.log(`Building Android release with version: ${version}`);

// Cross-platform helper functions
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function runCommand(command, options = {}) {
    const defaultOptions = { stdio: 'inherit', shell: true };
    execSync(command, { ...defaultOptions, ...options });
}

function extractArchive(zipPath, outputDir) {
    if (isWindows) {
        // Use PowerShell on Windows
        const extractCommand = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outputDir}' -Force"`;
        runCommand(extractCommand);
    } else {
        // Use unzip on Mac/Linux
        const extractCommand = `unzip -o "${zipPath}" -d "${outputDir}"`;
        runCommand(extractCommand);
    }
}

function getJavaCommand() {
    if (isWindows) {
        // Try common Java paths on Windows
        const javaPaths = [
            'java',
            'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe',
            'C:\\Program Files\\Java\\jdk-11\\bin\\java.exe',
            'C:\\Program Files\\Java\\jdk-8\\bin\\java.exe'
        ];

        for (const javaPath of javaPaths) {
            try {
                runCommand(`"${javaPath}" -version`, { stdio: 'pipe' });
                return javaPath;
            } catch (error) {
                // Continue to next path
            }
        }
        throw new Error('Java not found. Please install Java and ensure it\'s in your PATH.');
    } else {
        // On Mac/Linux, just use 'java' from PATH
        return 'java';
    }
}

try {
    // Clean the build
    console.log('Cleaning the build...');
    runCommand(isWindows ? 'cd android && gradlew clean && cd ..' : 'cd android && ./gradlew clean && cd ..');

    console.log('Building the AAB bundle...');
    runCommand(isWindows ? 'cd android && gradlew bundleRelease && cd ..' : 'cd android && ./gradlew bundleRelease && cd ..');

    // Create universal APK with version in filename
    console.log('Creating universal APK with version...');
    const aabPath = 'android/app/build/outputs/bundle/release/app-release.aab';
    const apksOutputPath = `android/app/build/outputs/apks/app-release-v${version}-universal.apks`;

    console.log('Validating keystore files exist...');
    const keystorePath = 'android/app/anythingllm-upload-key.keystore';
    const keystorePassword = 'anythingllm!';
    const keystoreAlias = 'anythingllm-keystore';
    if (!fs.existsSync(keystorePath)) {
        console.error('Keystore file not found. Please ensure the keystore file exists at android/app/anythingllm-upload-key.keystore');
        process.exit(1);
    }

    // Get Java command
    const javaCommand = getJavaCommand();

    const bundletoolCommand = [
        `"${javaCommand}" -jar scripts/bundletool-1.18.1.jar build-apks`,
        `--bundle="${aabPath}"`,
        `--output="${apksOutputPath}"`,
        '--mode=universal',
        `--ks="${keystorePath}"`,
        `--ks-key-alias="${keystoreAlias}"`,
        `--ks-pass="pass:${keystorePassword}"`
    ].join(' ');

    runCommand(bundletoolCommand);

    // Extract the universal APK with versioned name
    const outputDir = `android/app/build/outputs/apks/universal-v${version}`;
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Copy and extract
    const zipPath = `android/app/build/outputs/apks/app-release-v${version}-universal.zip`;
    fs.copyFileSync(apksOutputPath, zipPath);

    // Extract the APK using cross-platform method
    console.log('Extracting universal APK...');
    extractArchive(zipPath, outputDir);

    // Rename the APK to app-release-v${version}-universal.apk
    const apkPath = path.join(outputDir, `universal.apk`);
    fs.renameSync(apkPath, path.join(outputDir, `anythingllm-universal.apk`));
    fs.writeFileSync(path.join(outputDir, `version.txt`), version);

    // Clean up zip file
    fs.unlinkSync(zipPath);
    fs.unlinkSync(apksOutputPath);

    console.log(`✅ Android release build completed successfully!`);
    console.log(`📱 Universal APK extracted to: ${outputDir}`);
    console.log(`📦 AAB bundle: ${aabPath}`);
    console.log(` APKs package: ${apksOutputPath}`);

    // Show the final APK file
    const apkFiles = fs.readdirSync(outputDir).filter(file => file.endsWith('.apk'));
    if (apkFiles.length > 0) {
        console.log(`🎯 Final APK: ${path.join(outputDir, apkFiles[0])}`);
    }
} catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
} 