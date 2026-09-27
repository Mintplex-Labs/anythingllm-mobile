package com.anythingllm

import com.facebook.react.bridge.*
import android.app.ActivityManager
import android.content.Context
import android.os.Build
import java.io.File

class DeviceInfoModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeviceInfoModule"

    @ReactMethod
    fun getChipset(promise: Promise) {
        try {
            val chipset = Build.HARDWARE.takeUnless { it.isNullOrEmpty() } ?: Build.BOARD
            promise.resolve(chipset)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    /**
     * System-wide RAM snapshot. `available` is what the OS could hand out right now without
     * killing anything (free + reclaimable cache) - react-native-device-info only exposes total RAM
     * and this app's own usage, neither of which tells us if an on-device model will fit.
     */
    @ReactMethod
    fun getMemoryInfo(promise: Promise) {
        try {
            val activityManager = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memoryInfo = ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memoryInfo)

            val result = Arguments.createMap()
            result.putDouble("total", memoryInfo.totalMem.toDouble())
            result.putDouble("available", memoryInfo.availMem.toDouble())
            result.putDouble("threshold", memoryInfo.threshold.toDouble())
            result.putBoolean("lowMemory", memoryInfo.lowMemory)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getCPUInfo(promise: Promise) {
        try {
            val cpuInfo = Arguments.createMap()
            cpuInfo.putInt("cores", Runtime.getRuntime().availableProcessors())
            
            val processors = Arguments.createArray()
            val features = mutableSetOf<String>()
            val cpuInfoFile = File("/proc/cpuinfo")
            
            if (cpuInfoFile.exists()) {
                val cpuInfoLines = cpuInfoFile.readLines()
                var currentProcessor = Arguments.createMap()
                var hasData = false
                
                for (line in cpuInfoLines) {
                    if (line.isEmpty() && hasData) {
                        processors.pushMap(currentProcessor)
                        currentProcessor = Arguments.createMap()
                        hasData = false
                        continue
                    }
                    
                    val parts = line.split(":")
                    if (parts.size >= 2) {
                        val key = parts[0].trim()
                        val value = parts[1].trim()
                        when (key) {
                            "processor", "model name", "cpu MHz", "vendor_id" -> {
                                currentProcessor.putString(key, value)
                                hasData = true
                            }
                            "flags", "Features" -> {  // "flags" for x86, "Features" for ARM
                                features.addAll(value.split(" ").filter { it.isNotEmpty() })
                            }
                        }
                    }
                }
                
                if (hasData) {
                    processors.pushMap(currentProcessor)
                }
                
                cpuInfo.putArray("processors", processors)
                
                // Convert features set to array
                val featuresArray = Arguments.createArray()
                features.forEach { featuresArray.pushString(it) }
                cpuInfo.putArray("features", featuresArray)

                // ML-related CPU features detection
                cpuInfo.putBoolean("hasFp16", features.any { it in setOf("fphp", "fp16") })
                cpuInfo.putBoolean("hasDotProd", features.any { it in setOf("dotprod", "asimddp") })
                cpuInfo.putBoolean("hasSve", features.any { it == "sve" })
                cpuInfo.putBoolean("hasI8mm", features.any { it == "i8mm" })
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                cpuInfo.putString("socModel", Build.SOC_MODEL)
            }
            
            promise.resolve(cpuInfo)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
} 