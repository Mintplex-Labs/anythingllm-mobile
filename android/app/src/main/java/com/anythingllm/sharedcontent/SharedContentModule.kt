package com.anythingllm.sharedcontent

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Base64
import android.util.Log
import android.webkit.MimeTypeMap
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max

/**
 * Receives content other apps share to AnythingLLM (ACTION_SEND / ACTION_SEND_MULTIPLE - see the
 * intent filters on MainActivity) and hands it to JS as a list of items.
 *
 * Every shared stream is copied into `cacheDir/shared/<uuid>/<name>` straight away: the read grant on
 * a shared content:// URI only lasts as long as the receiving activity, and JS processes the file
 * later, after navigating to a chat. JS removes the copy once it has parsed it (see utils/SharedContent).
 *
 *  - Cold start: the SEND intent is the activity's launch intent. JS asks for it with `getInitialShare()`,
 *    after which the intent is replaced so a reload does not share the same files twice.
 *  - Already running (`launchMode="singleTask"`): the SEND intent arrives in `onNewIntent` and is emitted
 *    as a `SharedContentReceived` event.
 *
 * `prepareImage` downscales a shared image to a base64 JPEG the same way the image picker does for
 * images attached from the gallery.
 */
class SharedContentModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        private const val TAG = "SharedContentModule"
        const val EVENT_NAME = "SharedContentReceived"
        private const val SHARED_DIR = "shared"
    }

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "SharedContentModule"

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {}

    override fun onNewIntent(intent: Intent) {
        try {
            val items = extractItems(intent) ?: return
            sendEvent(items)
        } catch (e: Exception) {
            Log.e(TAG, "Could not read shared content from new intent", e)
        }
    }

    /**
     * The content the app was launched with, or null when it was opened normally. Consumes the
     * intent so a JS reload (or asking twice) does not return the same share again.
     */
    @ReactMethod
    fun getInitialShare(promise: Promise) {
        try {
            val activity = reactContext.currentActivity
            val intent = activity?.intent
            if (activity == null || intent == null) return promise.resolve(null)
            // Relaunching from the recents screen re-delivers the original SEND intent - ignore it,
            // the files were already handled (and the URI grants are gone anyway).
            if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return promise.resolve(null)
            val items = extractItems(intent) ?: return promise.resolve(null)
            activity.intent = Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_LAUNCHER) }
            promise.resolve(items)
        } catch (e: Exception) {
            Log.e(TAG, "Could not read shared content from launch intent", e)
            promise.reject("ERR_SHARED_CONTENT", e.message, e)
        }
    }

    /**
     * Downscale an image so its longest edge is at most `maxDimension` px, apply the EXIF rotation and
     * return it as a base64 JPEG. Runs off the bridge thread - a 12MP photo takes a moment to decode.
     */
    @ReactMethod
    fun prepareImage(path: String, maxDimension: Int, quality: Double, promise: Promise) {
        Thread {
            try {
                val file = File(Uri.parse(path).path ?: path)
                if (!file.exists()) throw IllegalArgumentException("Image not found: $path")

                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(file.absolutePath, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalArgumentException("Could not decode image")

                // Decode at a power-of-two fraction that is still >= the target so the final scale stays sharp.
                var sampleSize = 1
                while (max(bounds.outWidth, bounds.outHeight) / (sampleSize * 2) >= maxDimension) sampleSize *= 2
                val decoded = BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sampleSize })
                    ?: throw IllegalArgumentException("Could not decode image")

                val matrix = Matrix()
                applyExifOrientation(file, matrix)
                val longest = max(decoded.width, decoded.height)
                if (longest > maxDimension) {
                    val scale = maxDimension.toFloat() / longest
                    matrix.postScale(scale, scale)
                }
                val result = if (matrix.isIdentity) decoded
                else Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)

                val out = ByteArrayOutputStream()
                val jpegQuality = (quality * 100).toInt().coerceIn(1, 100)
                result.compress(Bitmap.CompressFormat.JPEG, jpegQuality, out)
                if (result !== decoded) decoded.recycle()
                val base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)

                val map = Arguments.createMap().apply {
                    putString("base64", base64)
                    putString("mime", "image/jpeg")
                    putInt("width", result.width)
                    putInt("height", result.height)
                }
                result.recycle()
                promise.resolve(map)
            } catch (e: Exception) {
                Log.e(TAG, "prepareImage failed", e)
                promise.reject("ERR_PREPARE_IMAGE", e.message, e)
            }
        }.start()
    }

    // Required for NativeEventEmitter - nothing to do, RCTDeviceEventEmitter handles subscriptions.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    private fun sendEvent(items: WritableArray) {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_NAME, items)
    }

    /**
     * Turn a SEND / SEND_MULTIPLE intent into the item list JS expects, or null when the intent is
     * not a share. Streams are copied into the app cache; a text-only share becomes a `text` item.
     */
    private fun extractItems(intent: Intent): WritableArray? {
        val uris = mutableListOf<Uri>()
        when (intent.action) {
            Intent.ACTION_SEND -> streamExtra(intent)?.let { uris.add(it) }
            Intent.ACTION_SEND_MULTIPLE -> uris.addAll(streamExtras(intent))
            else -> return null
        }

        val items = Arguments.createArray()
        if (uris.isEmpty()) {
            val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.takeIf { it.isNotBlank() } ?: return null
            items.pushMap(Arguments.createMap().apply {
                putString("kind", "text")
                putString("text", text)
            })
            return items
        }

        for (uri in uris) {
            try {
                copyToShared(uri, intent.type)?.let { items.pushMap(it) }
            } catch (e: Exception) {
                Log.e(TAG, "Could not copy shared item $uri", e)
            }
        }
        return if (items.size() == 0) null else items
    }

    private fun streamExtra(intent: Intent): Uri? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }

    private fun streamExtras(intent: Intent): List<Uri> {
        val list = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else @Suppress("DEPRECATION") intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
        return list?.filterNotNull() ?: emptyList()
    }

    /** Copy one shared stream into the app cache and describe it for JS. */
    private fun copyToShared(uri: Uri, intentType: String?): WritableMap? {
        val resolver = reactContext.contentResolver
        var displayName: String? = null
        var size: Long = -1

        if ("content".equals(uri.scheme, ignoreCase = true)) {
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (nameIndex >= 0) displayName = cursor.getString(nameIndex)
                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
                }
            }
        }

        // Share sheets frequently pass a wildcard type ("image/*") on the intent - prefer the provider's answer.
        val mimeType = resolver.getType(uri) ?: intentType?.takeIf { !it.contains('*') } ?: "application/octet-stream"
        var name = displayName?.takeIf { it.isNotBlank() }
            ?: uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() }
            ?: "shared-${System.currentTimeMillis()}"
        name = name.replace(Regex("[\\\\/:*?\"<>|]"), "_")
        if (!name.contains('.')) {
            MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)?.let { name = "$name.$it" }
        }

        val dir = File(reactContext.cacheDir, "$SHARED_DIR/${UUID.randomUUID()}")
        if (!dir.exists() && !dir.mkdirs()) throw IllegalStateException("Could not create ${dir.absolutePath}")
        val target = File(dir, name)
        val input = resolver.openInputStream(uri) ?: return null
        input.use { source -> FileOutputStream(target).use { sink -> source.copyTo(sink) } }
        if (size < 0) size = target.length()

        return Arguments.createMap().apply {
            putString("kind", if (mimeType.startsWith("image/")) "image" else "file")
            putString("uri", Uri.fromFile(target).toString())
            putString("name", name)
            putString("mimeType", mimeType)
            putDouble("size", size.toDouble())
        }
    }

    @Suppress("DEPRECATION")
    private fun applyExifOrientation(file: File, matrix: Matrix) {
        val orientation = try {
            ExifInterface(file.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } catch (e: Exception) {
            ExifInterface.ORIENTATION_NORMAL
        }
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.postRotate(90f); matrix.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.postRotate(270f); matrix.postScale(-1f, 1f) }
            else -> {}
        }
    }
}
