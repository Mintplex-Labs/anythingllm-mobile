# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# llama.rn ships no consumer rules; its Java layer is 3 small classes
-keep class com.rnllama.** { *; }

# react-native-config reads BuildConfig via Class.forName
-keep class com.anythingllm.BuildConfig { *; }

# pdfbox-android 2.0.27.0: JPXFilter optionally uses jp2-android (com.gemalto.jp2) for
# JPEG 2000 images. We don't ship it, so the class is already absent at runtime;
# PdfParserModule only extracts text. R8 missing-class error, 2026-09-27
-dontwarn com.gemalto.jp2.JP2Decoder

# ObjectBox 4.3.0: Query.findWithScores()/findIdsWithScores() construct these in native code
# (JNI <init>), so nothing in Java references their constructors and R8 strips them.
# VectorBox.semanticSearch (RAG) uses findWithScores. Stripped in Phase 2 build, 2026-09-27
-keep class io.objectbox.query.ObjectWithScore { *; }
-keep class io.objectbox.query.IdWithScore { *; }

# Readable Crashlytics traces after obfuscation
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
