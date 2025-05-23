package com.anythingllm.storage

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.util.Log
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

class StorageModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        private const val TAG = "StorageModule"
    }

    override fun getName(): String = "StorageModule"

    @ReactMethod
    fun getRealPathFromUri(uriString: String, promise: Promise) {
        Log.d(TAG, "getRealPathFromUri: $uriString")
        var realPath = ""
        try {
            val uri = Uri.parse(uriString)
            realPath = getPath(reactApplicationContext, uri) ?: ""
            if (realPath.isNotEmpty()) promise.resolve(realPath)
            else promise.reject("ERROR", "Could not get real path for URI: $uriString")
        } catch (e: Exception) {
            Log.e(TAG, "Error getting real path", e)
            promise.reject("ERROR", e.message)
        } finally {
            Log.d(TAG, "getRealPathFromUri result: $realPath")
        }
    }

    /**
     * Get a file path from a Uri. This will get the the path for Storage Access
     * Framework Documents, as well as the _data field for the MediaStore and
     * other file-based ContentProviders.
     */
    private fun getPath(context: Context, uri: Uri): String? {
        val isKitKat = Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT

        // DocumentProvider
        if (isKitKat && DocumentsContract.isDocumentUri(context, uri)) {
            // ExternalStorageProvider
            if (isExternalStorageDocument(uri)) {
                val docId = DocumentsContract.getDocumentId(uri)
                val split = docId.split(":")
                val type = split[0]
                if ("primary".equals(type, ignoreCase = true)) return Environment.getExternalStorageDirectory().toString() + "/" + split[1]
            }

            // DownloadsProvider
            else if (isDownloadsDocument(uri)) {
                val id = DocumentsContract.getDocumentId(uri)
                val contentUri = ContentUris.withAppendedId(Uri.parse("content://downloads/public_downloads"), id.toLong())
                return getDataColumn(context, contentUri, null, null)
            }
            
            // MediaProvider
            else if (isMediaDocument(uri)) {
                val docId = DocumentsContract.getDocumentId(uri)
                val decodedDocId = java.net.URLDecoder.decode(docId, "UTF-8")
                val split = decodedDocId.split(":")
                val type = split[0]
                val contentUri = when (type) {
                    "image" -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                    "video" -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                    "audio" -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                    "document" -> MediaStore.Files.getContentUri("external")
                    else -> null
                }
                
                val selection = "_id=?"
                val selectionArgs = arrayOf(split[1])

                // If the type is document and the split size is greater than 1 (document ID is idx 1), return the content URI
                if(type == "document" && split.size > 1) {
                    Log.d(TAG, "Document ID: ${split[1]} -> ${contentUri}/${split[1]}")
                    return "${contentUri}/${split[1]}"
                }

                Log.d(TAG, "Querying content URI: $contentUri")
                Log.d(TAG, "Selection: $selection")
                Log.d(TAG, "Selection args: ${selectionArgs.joinToString(", ")}")
                return contentUri?.let { nonNullUri ->
                    getDataColumn(context, nonNullUri, selection, selectionArgs)
                }
            }
        }

        // MediaStore (and general)
        else if ("content".equals(uri.scheme, ignoreCase = true)) {
            if (isGooglePhotosUri(uri)) return uri.lastPathSegment
            return getDataColumn(context, uri, null, null)
        }
        // Generic File
        else if ("file".equals(uri.scheme, ignoreCase = true)) return uri.path
        return null
    }

    /**
     * Get the value of the data column for this Uri. This is useful for
     * MediaStore Uris, and other file-based ContentProviders.
     */
    private fun getDataColumn(
        context: Context,
        uri: Uri,
        selection: String?,
        selectionArgs: Array<String>?
    ): String? {
        var cursor: Cursor? = null
        val column = "_data"
        val projection = arrayOf(column)

        try {
            Log.d(TAG, "getDataColumn: $uri")
            Log.d(TAG, "selection: $selection")
            Log.d(TAG, "selectionArgs: $selectionArgs")
            Log.d(TAG, "projection: ${projection.joinToString(", ")}")

            cursor = context.contentResolver.query(uri, projection, selection, selectionArgs, null)
            if (cursor?.moveToFirst() == true) {
                val index = cursor.getColumnIndexOrThrow(column)
                return cursor.getString(index)
            }
        } finally {
            cursor?.close()
        }
        return null
    }

    private fun isExternalStorageDocument(uri: Uri): Boolean {
        return "com.android.externalstorage.documents" == uri.authority
    }

    private fun isDownloadsDocument(uri: Uri): Boolean {
        return "com.android.providers.downloads.documents" == uri.authority
    }

    private fun isMediaDocument(uri: Uri): Boolean {
        return "com.android.providers.media.documents" == uri.authority
    }

    private fun isGooglePhotosUri(uri: Uri): Boolean {
        return "com.google.android.apps.photos.content" == uri.authority
    }
}