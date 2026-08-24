package com.bissbilanz.android.ui

import android.content.Context
import android.content.Intent
import android.provider.Settings

/**
 * Opens this app's notification settings. The only route left once POST_NOTIFICATIONS has
 * been denied twice — the system stops showing the runtime dialog at that point.
 */
fun openNotificationSettings(context: Context) {
    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
    intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
}
