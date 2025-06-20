package com.anythingllm.vector

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import android.util.Log

import io.objectbox.Box
import io.objectbox.BoxStore
import io.objectbox.query.Query
import io.objectbox.annotation.Entity
import io.objectbox.annotation.Id
import io.objectbox.annotation.HnswIndex
import io.objectbox.annotation.VectorDistanceType
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

@Entity
data class VectorEntity(
        @Id var id: Long = 0,
        // https://objectbox.io/docfiles/java/current/io/objectbox/annotation/VectorDistanceType.html
        // Fixed dimensions for now, assuming nomic-embed-text-v1.5-GGUF
        @HnswIndex(dimensions = 768, distanceType = VectorDistanceType.COSINE)
        var embedding: FloatArray? = null,
        var metadata: String? = null,
        var workspaceSlug: String? = null
)

class VectorBox(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        private const val TAG = "VectorBox"
      
        @Volatile
        private var store: BoxStore? = null
        private val lock = java.util.concurrent.locks.ReentrantLock()
    }

    private val box: Box<VectorEntity>

    init {
        // Ensure singleton BoxStore
        if (store == null) {
            lock.withLock {
                if (store == null) {
                    store = MyObjectBox.builder()
                        .androidContext(reactContext.applicationContext)
                        .build()
                }
            }
        }
        box = store!!.boxFor(VectorEntity::class.java)
    }

    override fun getName(): String = "VectorBox"

    @ReactMethod
    fun getCount(promise: Promise) {
        try {
            val count = box.count()
            promise.resolve(count.toDouble())
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)  
        }
    }

    @ReactMethod
    fun workspaceVectorCount(workspaceSlug: String, promise: Promise) {
        try {
            Log.d(TAG, "getting vector count for workspace: $workspaceSlug")
            val query = box.query(VectorEntity_.workspaceSlug.equal(workspaceSlug)).build()
            val results = query.find()
            promise.resolve(results.size.toDouble())
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun insert(workspaceSlug: String, embeddingArray: ReadableArray, metadata: String?, promise: Promise) {
        try {
            Log.d(TAG, "inserting vector for workspace: $workspaceSlug")
            val embedding = FloatArray(embeddingArray.size())
            for (i in 0 until embeddingArray.size()) {
                embedding[i] = embeddingArray.getDouble(i).toFloat()
            }
            val vectorEntity = VectorEntity(
                embedding = embedding, 
                metadata = metadata,
                workspaceSlug = workspaceSlug
            )
            box.put(vectorEntity)
            promise.resolve(vectorEntity.id.toDouble())
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun bulkInsert(workspaceSlug: String, vectors: ReadableArray, promise: Promise) {
        try {
            Log.d(TAG, "inserting ${vectors.size()} vectors into workspace: $workspaceSlug")
            val vectorEntities = ArrayList<VectorEntity>()
            for (i in 0 until vectors.size()) {
                val vector = vectors.getMap(i)
                val embeddingArray = vector.getArray("embedding")
                if (embeddingArray == null) throw Exception("Embedding array is null")
                
                val embedding = FloatArray(embeddingArray.size())
                for (j in 0 until embeddingArray.size()) embedding[j] = embeddingArray.getDouble(j).toFloat()
                if (embedding.size == 0) throw Exception("Embedding array is empty")

                val metadata = vector.getString("metadata") ?: "{}"
                vectorEntities.add(VectorEntity(
                    embedding = embedding, 
                    metadata = metadata,
                    workspaceSlug = workspaceSlug
                ))
            }
            
            box.put(vectorEntities)
            val vectorBoxIds = Arguments.createArray()
            for (entity in vectorEntities) vectorBoxIds.pushDouble(entity.id.toDouble());
            promise.resolve(vectorBoxIds)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun resetVectorsForWorkspace(workspaceSlug: String, promise: Promise) {
        try {
            Log.d(TAG, "resetting vectors for workspace: $workspaceSlug")
            val query = box.query(VectorEntity_.workspaceSlug.equal(workspaceSlug)).build()
            val results = query.find()
            for (result in results) box.remove(result);
            Log.d(TAG, "Removed ${results.size} vectors for workspace: $workspaceSlug")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun semanticSearch(workspaceSlug: String, queryVector: ReadableArray, topN: Int = 2, promise: Promise) {
        try {
            Log.d(TAG, "running semantic search for workspace: $workspaceSlug. Top N: $topN")
            val queryVectorArray = FloatArray(queryVector.size())
            for (i in 0 until queryVector.size()) queryVectorArray[i] = queryVector.getDouble(i).toFloat();

            val query = box
            .query(
                VectorEntity_.workspaceSlug.equal(workspaceSlug)
                .and(VectorEntity_.embedding.nearestNeighbors(queryVectorArray, topN))
            ).build()

            val queryResults = query.findWithScores()
            Log.d(TAG, "Found ${queryResults.size} vectors for workspace: $workspaceSlug")
            val resultsArray = Arguments.createArray()
            for (result in queryResults) {
                val resultMap = Arguments.createMap().apply {
                    putDouble("id", result.get().id.toDouble())
                    putString("metadata", result.get().metadata ?: "{}")
                    putDouble("score", result.score)
                }
                resultsArray.pushMap(resultMap)
            }

            promise.resolve(resultsArray)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun reset(promise: Promise) {
        try {
            box.removeAll()
            Log.d(TAG, "Entire VectorDB reset - all vectors deleted!")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

     @ReactMethod
    fun deleteVectorsByIds(ids: ReadableArray, promise: Promise) {
        try {
            for (i in 0 until ids.size()) box.remove(ids.getDouble(i).toLong())
            Log.d(TAG, "Deleted ${ids.size()} vectors!")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}