// ---------------------------------------------------------------------
// Copyright (c) 2024 Qualcomm Innovation Center, Inc. All rights reserved.
// SPDX-License-Identifier: BSD-3-Clause
// ---------------------------------------------------------------------
#include <android/log.h>
#include <filesystem>
#include <iostream>
#include <jni.h>
#include <string>

#include "GenieWrapper.hpp"

extern "C" JNIEXPORT jlong JNICALL Java_com_anythingllm_chatqnn_ChatQnnModule_loadModel(JNIEnv* env,
                                                                                   jobject /* this */,
                                                                                   jstring model_dir_path,
                                                                                   jstring htp_config_path) {
    try {
        // Get UTF-8 strings from JNI
        const char* model_dir_chars = env->GetStringUTFChars(model_dir_path, nullptr);
        const char* htp_config_chars = env->GetStringUTFChars(htp_config_path, nullptr);
        
        if (!model_dir_chars || !htp_config_chars) throw std::runtime_error("Failed to get UTF-8 strings from JNI");

        // Convert to std::string
        std::string model_dir = model_dir_chars;
        std::string htp_config = htp_config_chars;

        // Release the JNI strings
        env->ReleaseStringUTFChars(model_dir_path, model_dir_chars);
        env->ReleaseStringUTFChars(htp_config_path, htp_config_chars);

        std::filesystem::path model_config_path = std::filesystem::path(model_dir) / "genie_config.json";
        std::filesystem::path tokenizer_path = std::filesystem::path(model_dir) / "tokenizer.json";

        // Verify paths exist
        if (!std::filesystem::exists(model_config_path)) {
            throw std::runtime_error("Model config file not found: " + model_config_path.string());
        }
        if (!std::filesystem::exists(tokenizer_path)) {
            throw std::runtime_error("Tokenizer file not found: " + tokenizer_path.string());
        }

        App::GenieWrapper* chatApp = new App::GenieWrapper(model_config_path.string(), model_dir, htp_config, tokenizer_path.string());
        return reinterpret_cast<jlong>(chatApp);
    } catch (std::exception& e) {
        jclass exception_cls = env->FindClass("java/lang/RuntimeException");
        env->ThrowNew(exception_cls, e.what());
        return 0;
    }
}

extern "C" JNIEXPORT void JNICALL Java_com_anythingllm_chatqnn_ChatQnnModule_getResponseForPrompt(JNIEnv* env,
                                                                                             jobject /* this */,
                                                                                             jlong genie_wrapper_handle,
                                                                                             jstring templated_prompt,
                                                                                             jobject callback) {
    try {
        __android_log_print(ANDROID_LOG_INFO, "GenieLib", "getResponseForPrompt");
        jclass callbackClass = env->GetObjectClass(callback);
        jmethodID onNewStringMethod = env->GetMethodID(callbackClass, "onNewString", "(Ljava/lang/String;)V");

        std::string completion_prompt = env->GetStringUTFChars(templated_prompt, 0);
        __android_log_print(ANDROID_LOG_INFO, "GenieLib", "completion_prompt: %s", completion_prompt.c_str());

        App::GenieWrapper* myClass = reinterpret_cast<App::GenieWrapper*>(genie_wrapper_handle);
        auto response = myClass->GetResponseForPrompt(completion_prompt, env, callback, onNewStringMethod);
    } catch (std::exception& e){
        __android_log_print(ANDROID_LOG_ERROR, "GenieLib", "Exception: %s", e.what());
        jclass exception_cls = env->FindClass("java/lang/RuntimeException");
        env->ThrowNew(exception_cls, e.what());
    }
}

extern "C" JNIEXPORT void JNICALL Java_com_anythingllm_chatqnn_ChatQnnModule_freeModel(JNIEnv* env,
                                                                                  jobject /* this */,
                                                                                  jlong genie_wrapper_handle) {
    try {
        __android_log_print(ANDROID_LOG_INFO, "GenieLib", "Freeing GenieWrapper");
        App::GenieWrapper* genie_wrapper = reinterpret_cast<App::GenieWrapper*>(genie_wrapper_handle);
        delete genie_wrapper;
    } catch (std::exception& e) {
        __android_log_print(ANDROID_LOG_ERROR, "GenieLib", "Exception: %s", e.what());
        jclass exception_cls = env->FindClass("java/lang/RuntimeException");
        env->ThrowNew(exception_cls, e.what());
    }
}
