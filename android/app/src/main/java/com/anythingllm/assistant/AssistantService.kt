package com.anythingllm.assistant

import android.service.voice.VoiceInteractionService

/**
 * Digital assistant: lets the user pick AnythingLLM as the device's default assistant app (Settings >
 * Apps > Default apps > Digital assistant app), the slot Gemini holds out of the box. Once picked, the
 * assist gesture (long-press home / corner swipe / power button, depending on the device) opens an
 * AssistantSession, which launches the AnythingLLM overlay over whatever app is on screen.
 *
 * The system binds this service while we hold the role; all the work happens in the session
 * (AssistantSessionService). Declared in the manifest with res/xml/assistant_interaction_service.xml.
 */
class AssistantService : VoiceInteractionService()
