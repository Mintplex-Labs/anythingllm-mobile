package com.anythingllm.chatqnn;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import android.util.Log;
import android.system.Os;
import android.os.Build;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

interface StringCallback {
    fun onNewString(response: String)
}

class ChatQnnModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        private const val TAG = "ChatQnnModule"
        private val SUPPORTED_SOC_MODELS = setOf(
            "SM8750", // Snapdragon 8 Elite
        )
    }

    private var isInitialized = false
    private var isCompatible = false

    private var genieWrapperHandle: Long = 0
    private val reactContext: ReactApplicationContext = reactContext
    private val EVENT_NAME = "onTokenGenerated"
    private val executorService: ExecutorService = Executors.newSingleThreadExecutor()

    // Native method declarations
    public external fun getResponseForPrompt(chatQnnWrapperHandle: Long, userQuestion: String, callback: Any)
    public external fun freeModel(chatQnnWrapperHandle: Long)
    public external fun loadModel(modelDirPath: String, htpConfigPath: String): Long

    init {
        isCompatible = checkDeviceCompatibility()
        if (isCompatible) {
            Log.d(TAG, "Starting ChatQnn library initialization")
            try {
                val appLibDir = reactContext.applicationInfo.nativeLibraryDir
                Log.d(TAG, "App native library path: $appLibDir")
                
                // Make QNN libraries discoverable
                Os.setenv("ADSP_LIBRARY_PATH", appLibDir, true)
                Os.setenv("LD_LIBRARY_PATH", appLibDir, true)
                
                val libFile = File(appLibDir, "libchatqnn.so")
                Log.d(TAG, "Looking for library at: ${libFile.absolutePath}")
                Log.d(TAG, "Library exists: ${libFile.exists()}")
                
                Log.d(TAG, "Attempting to load ChatQnn library")
                System.loadLibrary("chatqnn");
                Log.d(TAG, "Successfully loaded ChatQnn library")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load ChatQnn library", e)
                Log.e(TAG, "Error details: ${e.message}")
                e.printStackTrace()
            }
        } else {
            Log.w(TAG, "Device is not compatible with QNN. Will not initialize ChatQnn library.")
        }
        isInitialized = true
    }

    override fun getName(): String = "GenieModule"

    @ReactMethod
    fun supportedDevice(promise: Promise) {
        promise.resolve(isCompatible)
    }

    @ReactMethod
    fun ping(promise: Promise) {
        try {
            promise.resolve("Got response from JNI")
        } catch (e: Exception) {
            Log.e(TAG, "Error in ping: ${e.message}")
            promise.reject("PING_ERROR", e.message)
        }
    }

    @ReactMethod
    fun loadModel(modelFolderName: String, promise: Promise) {
        try {
            genieWrapperHandle = genieLoader(modelFolderName)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error loading model: ${e.message}")
            promise.reject("LOAD_MODEL_ERROR", e.message)
        }
    }

    @ReactMethod
    fun generateResponse(modelFolderName: String, prompt: String, promise: Promise) {
        try {
            if (genieWrapperHandle == 0L) {
                Log.d(TAG, "Genie model not loaded, auto-loading model")
                genieLoader(modelFolderName)
            }

            executorService.execute {
                getResponseForPrompt(genieWrapperHandle, prompt, object : StringCallback {
                    override fun onNewString(response: String) {
                        val params: WritableMap = Arguments.createMap()
                        params.putString("token", response)
                        sendEvent(EVENT_NAME, params)
                    }
                })
                promise.resolve(true)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error sending prompt: ${e.message}")
            promise.reject("SEND_PROMPT_ERROR", e.message)
        }
    }

    @ReactMethod
    fun unloadModel(promise: Promise) {
        try {
            if (genieWrapperHandle == 0L) {
                Log.d(TAG, "No handle to unload - skipping")
                promise.resolve(true)
                return
            }

            executorService.execute {
                freeModel(genieWrapperHandle)
                promise.resolve(true)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error unloading model: ${e.message}")
            promise.reject("UNLOAD_MODEL_ERROR", e.message)
        }
    }

    private fun genieLoader(modelFolderName: String): Long {
        try {
            val modelDirPath = copyFilesToModelDir(modelFolderName)

            // TODO:
            // We only support the 8 Elite right now - so this config is hardcoded. When we support more, we'll need to make this dynamic.
            val htpConfigPath = File(reactContext.filesDir, "htp_config/qualcomm-snapdragon-8-elite.json").absolutePath
            
            Log.d(TAG, "Loading model from: $modelDirPath")
            Log.d(TAG, "HTP config path: $htpConfigPath")
            
            // Ensure QNN libraries are discoverable before creating Genie process
            val appLibDir = reactContext.applicationInfo.nativeLibraryDir
            Os.setenv("ADSP_LIBRARY_PATH", appLibDir, true)
            Os.setenv("LD_LIBRARY_PATH", appLibDir, true)

            Log.d(TAG, "ADSP_LIBRARY_PATH: ${Os.getenv("ADSP_LIBRARY_PATH")}")
            Log.d(TAG, "LD_LIBRARY_PATH: ${Os.getenv("LD_LIBRARY_PATH")}")
            
            genieWrapperHandle = loadModel(modelDirPath, htpConfigPath)
            Log.d(TAG, "Model loaded successfully with handle: $genieWrapperHandle")
            return genieWrapperHandle
        } catch (e: Exception) {
            Log.e(TAG, "Error loading model: ${e.message}")
            throw e
        }
    }

    private fun copyFilesToModelDir(modelTargetDir: String): String {
        try {
            // Create model directory
            val modelDir = File(reactContext.filesDir, "models/$modelTargetDir")
            if (!modelDir.exists()) modelDir.mkdirs()

            Log.d(TAG, "Starting to copy files from assets")
            val assetManager = reactContext.assets

            // List of files to copy with their source and destination paths
            val filesToCopy = listOf(
                "models/$modelTargetDir/genie_config.json" to "genie_config.json",
                "models/$modelTargetDir/tokenizer.json" to "tokenizer.json",
                "htp_config/qualcomm-snapdragon-8-elite.json" to "../../../htp_config/qualcomm-snapdragon-8-elite.json"
            )

            for ((sourcePath, destName) in filesToCopy) {
                try {
                    Log.d(TAG, "Copying $sourcePath to ${modelDir.absolutePath}/$destName")
                    
                    // Create parent directories if needed
                    val destFile = File(modelDir, destName)
                    destFile.parentFile?.mkdirs()
                    
                    // Copy the asset to the destination
                    assetManager.open(sourcePath).use { input ->
                        destFile.outputStream().use { output ->
                            input.copyTo(output)
                        }
                    }
                    Log.d(TAG, "Successfully copied $sourcePath")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to copy $sourcePath", e)
                }
            }

            // Log the contents of the destination directory
            Log.d(TAG, "Contents of ${modelDir.absolutePath}:")
            modelDir.listFiles()?.forEach { file ->
                Log.d(TAG, "File: ${file.name}")
            }
            return modelDir.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "Error in copyFilesToModelDir", e)
            throw e
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params);
    }

    // Check if the device is compatible with the QNN SDK (Snapdragon 8 Elite only rn)
    private fun checkDeviceCompatibility(): Boolean {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val socModel = Build.SOC_MODEL
                if (SUPPORTED_SOC_MODELS.contains(socModel)) {
                    Log.d(TAG, "Device has compatible SOC model: $socModel")
                    return true
                } else {
                    Log.d(TAG, "Device has incompatible SOC model: $socModel")
                    return false
                }
            }
            
            Log.w(TAG, "Build information cannot be determined - assuming incompatible")
            return false
        } catch (e: Exception) {
            Log.e(TAG, "Error checking device compatibility", e)
            return false
        }
    }
} 