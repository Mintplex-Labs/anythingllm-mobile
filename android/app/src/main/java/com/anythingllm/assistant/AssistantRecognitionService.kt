package com.anythingllm.assistant

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognitionService
import android.speech.SpeechRecognizer
import android.util.Log

/**
 * A pass-through speech recognizer.
 *
 * Android requires every assistant to declare a recognition service, and makes it the device's default
 * speech recognizer when the user picks that assistant. We have no recognizer of our own, so this one
 * forwards each request to another installed recognizer (Google's where available). Without that,
 * picking AnythingLLM as the assistant would break voice typing everywhere, our own mic button included
 * (@react-native-voice uses the default recognizer).
 */
class AssistantRecognitionService : RecognitionService() {

    companion object {
        private const val TAG = "AssistantRecognition"
        /** Tried in order before any other installed recognizer. */
        private val PREFERRED_PACKAGES = listOf(
            "com.google.android.googlequicksearchbox",
            "com.google.android.tts",
        )
    }

    private var delegate: SpeechRecognizer? = null

    override fun onStartListening(recognizerIntent: Intent, listener: Callback) {
        release()
        val recognizer = createDelegate()
        if (recognizer == null) {
            Log.w(TAG, "No other speech recognizer is installed")
            safely { listener.error(SpeechRecognizer.ERROR_CLIENT) }
            return
        }
        delegate = recognizer
        recognizer.setRecognitionListener(Forwarder(listener))
        recognizer.startListening(recognizerIntent)
    }

    override fun onStopListening(listener: Callback) {
        delegate?.stopListening()
    }

    override fun onCancel(listener: Callback) {
        release()
    }

    override fun onDestroy() {
        release()
        super.onDestroy()
    }

    private fun release() {
        delegate?.let {
            try {
                it.cancel()
                it.destroy()
            } catch (e: Exception) {
                Log.w(TAG, "Could not release the delegate recognizer", e)
            }
        }
        delegate = null
    }

    private fun createDelegate(): SpeechRecognizer? {
        val target = findRecognizer()
        if (target != null) return SpeechRecognizer.createSpeechRecognizer(this, target)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
            return SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
        }
        return null
    }

    private fun findRecognizer(): ComponentName? {
        val candidates = packageManager
            .queryIntentServices(Intent(SERVICE_INTERFACE), 0)
            .mapNotNull { it.serviceInfo }
            .filter { it.packageName != packageName }
        val chosen = PREFERRED_PACKAGES.firstNotNullOfOrNull { pkg -> candidates.firstOrNull { it.packageName == pkg } }
            ?: candidates.firstOrNull()
        return chosen?.let { ComponentName(it.packageName, it.name) }
    }

    private inline fun safely(block: () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            Log.w(TAG, "Recognition client went away", e)
        }
    }

    private inner class Forwarder(private val callback: Callback) : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) = safely { callback.readyForSpeech(params ?: Bundle()) }
        override fun onBeginningOfSpeech() = safely { callback.beginningOfSpeech() }
        override fun onRmsChanged(rmsdB: Float) = safely { callback.rmsChanged(rmsdB) }
        override fun onBufferReceived(buffer: ByteArray?) = safely { if (buffer != null) callback.bufferReceived(buffer) }
        override fun onEndOfSpeech() = safely { callback.endOfSpeech() }
        override fun onError(error: Int) = safely { callback.error(error) }
        override fun onResults(results: Bundle?) = safely { callback.results(results ?: Bundle()) }
        override fun onPartialResults(partialResults: Bundle?) = safely { callback.partialResults(partialResults ?: Bundle()) }
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }
}
