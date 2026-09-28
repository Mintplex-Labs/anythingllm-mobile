package com.anythingllm

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import android.os.Bundle  // Required for onCreate parameter


class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "AnythingLLM"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
      // Edge-to-edge is applied by ReactActivity via the edgeToEdgeEnabled gradle property.
      // Pass null to prevent react-native-screens fragments from being restored
      // This fixes the "Screen fragments should never be restored" crash
      // See: https://github.com/software-mansion/react-native-screens/issues/17
      // and https://github.com/software-mansion/react-native-screens?tab=readme-ov-file#android
      super.onCreate(null)
  }

  override fun onSaveInstanceState(outState: Bundle) {
      super.onSaveInstanceState(outState)
      // onCreate(null) above means saved state is never restored, so don't send it over Binder.
      // EditText saves its full text in the view hierarchy state; a large paste into the chat
      // composer exceeds the ~1MB transaction limit and crashes with TransactionTooLargeException.
      outState.clear()
  }
}
