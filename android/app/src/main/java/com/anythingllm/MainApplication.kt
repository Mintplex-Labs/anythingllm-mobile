package com.anythingllm

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.anythingllm.download.DownloadPackage
import com.anythingllm.storage.StoragePackage
import com.anythingllm.vector.VectorBoxPackage
import com.anythingllm.webscraper.WebScraperPackage
import com.anythingllm.pdfparser.PdfParserPackage
import com.anythingllm.scheduledjobs.ScheduledJobsPackage
import com.anythingllm.sharedcontent.SharedContentPackage

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              add(DeviceInfoPackage())
              add(KeepAwakePackage())
              add(ScreenLockPackage())
              add(DownloadPackage())
              add(StoragePackage())
              add(VectorBoxPackage())
              add(WebScraperPackage())
              add(PdfParserPackage())
              add(ScheduledJobsPackage())
              add(SharedContentPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
