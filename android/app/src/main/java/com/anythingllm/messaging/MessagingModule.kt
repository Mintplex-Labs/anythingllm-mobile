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
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import java.io.ByteArrayOutputStream

/**
 * Hands a drafted text message or email off to an app the user already has. We can never send
 * anything ourselves (no SEND_SMS, no contacts or account access) - this only opens the chosen
 * app with the recipient and body filled in so the user reviews and taps send.
 *
 * Texts: the default SMS app (Google Messages, Samsung Messages, ...) when a SIM is ready, plus the
 * popular chat apps in [KNOWN_MESSENGERS] that are installed.
 * Emails: every app that handles `mailto:` (Gmail, Outlook, Samsung Email, Proton Mail, ...).
 * All of them need matching `<queries>` entries in the manifest to be visible on Android 11+.
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

    private fun packagesHandling(intent: Intent): List<String> =
        pm.queryIntentActivities(intent, 0).map { it.activityInfo.packageName }.distinct()

    private fun smsPackages(): List<String> = packagesHandling(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")))

    private fun emailPackages(): List<String> = packagesHandling(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")))

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

    private fun labelOf(packageName: String): String? = try {
        pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
    } catch (e: PackageManager.NameNotFoundException) {
        null
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

    /** `[{ packageName, label, icon }]` in the given order, skipping ourselves and anything uninstalled mid-listing */
    private fun toAppArray(packages: Collection<String>): WritableArray {
        val apps = Arguments.createArray()
        for (packageName in packages) {
            if (packageName == reactContext.packageName) continue
            val label = labelOf(packageName) ?: continue
            apps.pushMap(Arguments.createMap().apply {
                putString("packageName", packageName)
                putString("label", label)
                putString("icon", iconDataUri(packageName))
            })
        }
        return apps
    }

    /** Starts [intent] inside [packageName], rejecting when that app cannot handle it */
    private fun launch(intent: Intent, packageName: String, promise: Promise) {
        intent.setPackage(packageName)
        if (pm.queryIntentActivities(intent, 0).isEmpty()) {
            promise.reject("app_unavailable", "$packageName cannot open this draft")
            return
        }
        // Launch from the activity when there is one - starting from the application context needs NEW_TASK.
        val activity = reactContext.currentActivity
        if (activity != null) activity.startActivity(intent)
        else reactContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        promise.resolve(true)
    }

    /**
     * Installed apps a text draft can be opened in, default SMS app first.
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
            promise.resolve(toAppArray(ordered))
        } catch (e: Exception) {
            promise.reject("messaging_apps_error", "Could not list messaging apps", e)
        }
    }

    /**
     * Installed mail apps, alphabetical. Same shape as [getMessagingApps]. Android has no default
     * email app role, so the JS side lists the last used one first.
     */
    @ReactMethod
    fun getEmailApps(promise: Promise) {
        try {
            promise.resolve(toAppArray(emailPackages().sortedBy { labelOf(it)?.lowercase() }))
        } catch (e: Exception) {
            promise.reject("email_apps_error", "Could not list email apps", e)
        }
    }

    /**
     * Opens [packageName] with the text draft filled in. With a phone number SMS apps and WhatsApp
     * open straight into that conversation; without one (or for apps with no "chat with number"
     * link) the text is shared into the app, which then asks who to send it to.
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
            launch(intent, packageName, promise)
        } catch (e: Exception) {
            promise.reject("messaging_open_error", "Could not open the messaging app", e)
        }
    }

    /**
     * Opens [packageName]'s compose screen with the email filled in. Everything goes in the
     * standard extras on a bare `mailto:` - also putting the addresses in the URI makes some
     * clients list every recipient twice.
     */
    @ReactMethod
    fun openEmailDraft(packageName: String, to: ReadableArray, cc: ReadableArray, subject: String, body: String, promise: Promise) {
        try {
            val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:"))
                .putExtra(Intent.EXTRA_SUBJECT, subject)
                .putExtra(Intent.EXTRA_TEXT, body)
            val toList = to.toStringList()
            val ccList = cc.toStringList()
            if (toList.isNotEmpty()) intent.putExtra(Intent.EXTRA_EMAIL, toList.toTypedArray())
            if (ccList.isNotEmpty()) intent.putExtra(Intent.EXTRA_CC, ccList.toTypedArray())
            launch(intent, packageName, promise)
        } catch (e: Exception) {
            promise.reject("email_open_error", "Could not open the email app", e)
        }
    }

    private fun ReadableArray.toStringList(): List<String> =
        (0 until size()).mapNotNull { getString(it)?.trim()?.takeIf { value -> value.isNotEmpty() } }
}
