package com.anythingllm.background

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.anythingllm.MainActivity
import com.anythingllm.R

/**
 * One foreground service for every piece of long-running work the app does in JS - a browser
 * agent session today; long replies from external providers and scheduled jobs can use it too.
 * Android freezes a backgrounded app within seconds, which stalls the JS thread and drops its
 * open connections. While any task is registered this service keeps the process running.
 *
 * The notification shows the most recently updated task (eg. the browser agent's current step)
 * and how many others are running. Tasks are registered and updated through BackgroundWorkModule.
 *
 * Main thread only.
 */
class BackgroundWorkService : Service() {
    data class Task(val id: String, var title: String, var body: String, var updatedAt: Long)

    companion object {
        private const val TAG = "BackgroundWorkService"
        private const val CHANNEL_ID = "anythingllm-background-work"
        private const val NOTIFICATION_ID = 7341

        private val tasks = LinkedHashMap<String, Task>()
        private var channelName = "Background work"
        private var moreTasksLabel = "+%d more"
        private var running = false

        /** Registers or updates a task and makes sure the service runs. False when Android refused to start it. */
        fun upsert(context: Context, id: String, title: String, body: String): Boolean {
            val existing = tasks[id]
            if (existing != null) {
                existing.title = title
                existing.body = body
                existing.updatedAt = System.currentTimeMillis()
            } else {
                tasks[id] = Task(id, title, body, System.currentTimeMillis())
            }
            if (running) {
                notify(context)
                return true
            }
            return try {
                val intent = Intent(context, BackgroundWorkService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
                else context.startService(intent)
                running = true
                true
            } catch (e: Exception) {
                // Android 12+ will not start one from the background - the work still runs while the app is open.
                Log.w(TAG, "Could not start the background work service", e)
                false
            }
        }

        fun remove(context: Context, id: String) {
            if (tasks.remove(id) == null) return
            if (tasks.isEmpty()) {
                running = false
                context.stopService(Intent(context, BackgroundWorkService::class.java))
            } else if (running) {
                notify(context)
            }
        }

        fun configure(channel: String, moreTasks: String) {
            channelName = channel
            moreTasksLabel = moreTasks
        }

        private fun notify(context: Context) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIFICATION_ID, build(context))
        }

        private fun build(context: Context): Notification {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_LOW).apply {
                    setShowBadge(false)
                })
            }
            val latest = tasks.values.maxByOrNull { it.updatedAt }
            val others = tasks.size - 1
            val open = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            val pending = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(latest?.title ?: "AnythingLLM")
                .setContentText(latest?.body ?: "")
                .setStyle(NotificationCompat.BigTextStyle().bigText(latest?.body ?: ""))
                .setSubText(if (others > 0) String.format(moreTasksLabel, others) else null)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setContentIntent(pending)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Everything ended between the start request and now.
        if (tasks.isEmpty()) {
            running = false
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            val notification = build(this)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
            else startForeground(NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            Log.w(TAG, "startForeground failed", e)
            running = false
            stopSelf()
        }
        // The work lives in the JS runtime - nothing to resume if the process dies.
        return START_NOT_STICKY
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        // Android 15+ caps dataSync at 6h a day. The tasks keep running while the app is open.
        Log.w(TAG, "Background work time limit reached - stopping the service")
        running = false
        stopSelf()
    }

    override fun onDestroy() {
        running = false
        super.onDestroy()
    }
}
