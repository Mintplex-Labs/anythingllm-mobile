package com.anythingllm.pdfparser

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import java.io.IOException
import android.util.Log
import android.net.Uri
import android.content.ContentResolver
import android.database.Cursor
import android.provider.MediaStore

class PdfParserModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
     companion object {
        private const val TAG = "PdfParserModule"
    }

    override fun getName(): String = "PdfParserModule"

    @ReactMethod
    fun extract(pdfPath: String, promise: Promise) {
        try {
            PDFBoxResourceLoader.init(reactApplicationContext)
            Log.d(TAG, "extracting pdf text content from $pdfPath")
            val realPdfPath = if (pdfPath.startsWith("content://")) getRealPathFromContentUri(pdfPath) ?: pdfPath else pdfPath
            
            Log.d(TAG, "Converted PDF real path: $realPdfPath")
            val pdfFile = File(realPdfPath)

            if (!pdfFile.exists()) {
                promise.reject("FILE_NOT_FOUND", "PDF file not found at path: $realPdfPath")
                return
            }
            
            if (!pdfFile.canRead()) {
                promise.reject("FILE_NOT_READABLE", "Cannot read PDF file at path: $realPdfPath")
                return
            }
            
            var document: PDDocument? = null
            try {
                document = PDDocument.load(pdfFile)
                if (document.isEncrypted) {
                    promise.reject("ENCRYPTED_PDF", "PDF is encrypted and cannot be processed")
                    return
                }
                
                val textStripper = PDFTextStripper()
                val totalPages = document.numberOfPages
                val resultArray = StringBuilder()
                for (pageIndex in 0 until totalPages) {
                    try {
                        textStripper.startPage = pageIndex + 1
                        textStripper.endPage = pageIndex + 1
                        val pageText = textStripper.getText(document)
                        resultArray.append(pageText.trim() + "\n")
                    } catch (e: Exception) {
                        Log.e(TAG, "extraction error page ${pageIndex + 1}: ${e.message}")
                    }
                }
                
                val result = Arguments.createMap()
                result.putString("textContent", resultArray.toString())
                result.putInt("totalPages", totalPages)
                result.putString("filePath", realPdfPath)
                result.putString("fileName", pdfFile.name)
                result.putDouble("fileSize", pdfFile.length().toDouble())
                promise.resolve(result)
            } finally {
                document?.close()
            }
        } catch (e: IOException) {
            promise.reject("IO_ERROR", "Error reading PDF file: ${e.message}")
        } catch (e: Exception) {
            promise.reject("EXTRACTION_ERROR", "Error extracting text from PDF: ${e.message}")
        }
    }
    
    /**
     * Get the real file path from a content URI
     */
    private fun getRealPathFromContentUri(contentUriString: String): String? {
        try {
            val uri = Uri.parse(contentUriString)
            val contentResolver = reactApplicationContext.contentResolver
            
            val projection = arrayOf(MediaStore.Files.FileColumns.DATA)
            val cursor: Cursor? = contentResolver.query(uri, projection, null, null, null)
            
            cursor?.use { c ->
                if (c.moveToFirst()) {
                    val columnIndex = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
                    return c.getString(columnIndex)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting real path from content URI: $contentUriString", e)
        }
        return null
    }
} 