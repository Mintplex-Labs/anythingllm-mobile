package com.anythingllm.messaging

import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import android.telephony.TelephonyManager
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream

/**
 * Hands a drafted text message off to the user's messaging app. We can never send a message
 * ourselves (no SEND_SMS, no contacts access) - this only opens the chosen app with the
 * recipient and body filled in so the user reviews and taps send.
 *
 * Which apps show up: the default SMS app (Google Messages, Samsung Messages, ...) when a SIM is ready,
 * plus the popular chat apps in [KNOWN_MESSENGERS] that are installed. Both need matching
 * `<queries>` entries in the manifest to be visible on Android 11+.
 */
class MessagingModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MessagingModule"

    companion object {
        /** Chat apps listed after the SMS app when installed. Order is the display order. */
        private val KNOWN_MESSENGERS = listOf(
            "com.whatsapp",
            "com.whatsapp.w4b",
            "org.telegram.messenger",
            "org.thoughtcrime.securesms",
            "com.facebook.orca",
            "com.viber.voip",
            "jp.naver.line.android",
            "com.discord",
        )
        private val WHATSAPP_PACKAGES = setOf("com.whatsapp", "com.whatsapp.w4b")
        private const val ICON_SIZE_PX = 96
    }

    private val pm: PackageManager get() = reactContext.packageManager

    private fun smsPackages(): List<String> =
        pm.queryIntentActivities(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")), 0)
            .map { it.activityInfo.packageName }
            .distinct()

    /** Any SIM slot (physical or eSIM) ready - no permission needed for the SIM state */
    private fun hasReadySim(): Boolean = try {
        val telephony = reactContext.getSystemService(TelephonyManager::class.java) ?: return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            (0 until telephony.activeModemCount).any { telephony.getSimState(it) == TelephonyManager.SIM_STATE_READY }
        } else {
            telephony.simState == TelephonyManager.SIM_STATE_READY
        }
    } catch (e: Exception) {
        false
    }

    private fun acceptsSharedText(packageName: String): Boolean {
        val intent = Intent(Intent.ACTION_SEND).setType("text/plain").setPackage(packageName)
        return pm.queryIntentActivities(intent, 0).isNotEmpty()
    }

    private fun iconDataUri(packageName: String): String? = try {
        val bitmap = drawableToBitmap(pm.getApplicationIcon(packageName))
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    } catch (e: Exception) {
        null
    }

    private fun drawableToBitmap(drawable: Drawable): Bitmap {
        if (drawable is BitmapDrawable && drawable.bitmap != null) {
            return Bitmap.createScaledBitmap(drawable.bitmap, ICON_SIZE_PX, ICON_SIZE_PX, true)
        }
        // Adaptive icons have no intrinsic bitmap - draw them onto a canvas.
        val bitmap = Bitmap.createBitmap(ICON_SIZE_PX, ICON_SIZE_PX, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        return bitmap
    }

    /**
     * Installed apps a draft can be opened in, default SMS app first.
     * Resolves to `[{ packageName, label, icon }]` where `icon` is a PNG data URI or null.
     */
    @ReactMethod
    fun getMessagingApps(promise: Promise) {
        try {
            val sms = smsPackages()
            val defaultSms = try { Telephony.Sms.getDefaultSmsPackage(reactContext) } catch (e: Exception) { null }
            val ordered = LinkedHashSet<String>()
            // Only the default SMS app can send texts, and only with a SIM. Otherwise Google Messages
            // accepts the intent and then parks an invisible 1x1 launch screen on top of us that
            // swallows every touch - the app looks frozen.
            if (hasReadySim()) defaultSms?.let { if (it in sms) ordered.add(it) }
            KNOWN_MESSENGERS.filter { acceptsSharedText(it) }.forEach { ordered.add(it) }
            ordered.remove(reactContext.packageName)

            val apps = Arguments.createArray()
            for (packageName in ordered) {
                val label = try {
                    pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
                } catch (e: PackageManager.NameNotFoundException) {
                    continue
                }
                apps.pushMap(Arguments.createMap().apply {
                    putString("packageName", packageName)
                    putString("label", label)
                    putString("icon", iconDataUri(packageName))
                })
            }
            promise.resolve(apps)
        } catch (e: Exception) {
            promise.reject("messaging_apps_error", "Could not list messaging apps", e)
        }
    }

    /**
     * Opens [packageName] with the draft filled in. With a phone number SMS apps and WhatsApp open
     * straight into that conversation; without one (or for apps with no "chat with number" link)
     * the text is shared into the app, which then asks who to send it to.
     */
    @ReactMethod
    fun openDraft(packageName: String, phoneNumber: String?, body: String, promise: Promise) {
        try {
            val number = phoneNumber?.trim()?.takeIf { it.isNotEmpty() }
            val digits = number?.filter { it.isDigit() }.orEmpty()
            val intent = when {
                number != null && packageName in WHATSAPP_PACKAGES && digits.isNotEmpty() ->
                    Intent(Intent.ACTION_VIEW, Uri.parse("https://api.whatsapp.com/send?phone=$digits&text=${Uri.encode(body)}"))
                number != null && packageName in smsPackages() ->
                    Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${Uri.encode(number)}")).putExtra("sms_body", body)
                else ->
                    Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, body)
            }
            intent.setPackage(packageName)
            if (pm.queryIntentActivities(intent, 0).isEmpty()) {
                promise.reject("messaging_app_unavailable", "$packageName cannot open this draft")
                return
            }
            // Launch from the activity when there is one - starting from the application context needs NEW_TASK.
            val activity = reactContext.currentActivity
            if (activity != null) activity.startActivity(intent)
            else reactContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("messaging_open_error", "Could not open the messaging app", e)
        }
    }
}
