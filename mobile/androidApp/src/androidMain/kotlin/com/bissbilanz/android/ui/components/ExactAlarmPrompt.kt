package com.bissbilanz.android.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.bissbilanz.android.R
import com.bissbilanz.android.reminders.ReminderAlarms

/**
 * Whether reminders can be scheduled on the minute. Re-read on every resume, because the
 * answer changes while the user is away on the system settings page.
 */
@Composable
fun rememberExactAlarmsAllowed(): Boolean {
    val context = LocalContext.current
    var allowed by remember { mutableStateOf(ReminderAlarms.canScheduleExact(context)) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        allowed = ReminderAlarms.canScheduleExact(context)
    }
    return allowed
}

/**
 * Asks for the "Alarms & reminders" special access when it is missing. Without it the
 * system may hold a reminder back by many minutes while the phone is idle, which reads
 * as a reminder that never came. Renders nothing once the access is granted.
 */
@Composable
fun ExactAlarmPrompt() {
    val context = LocalContext.current
    if (rememberExactAlarmsAllowed()) return
    Column {
        Text(
            stringResource(R.string.settings_reminders_exact_missing),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
        TextButton(onClick = { openExactAlarmSettings(context) }) {
            Text(stringResource(R.string.settings_reminders_exact_grant))
        }
    }
}

/**
 * Opens this app's "Alarms & reminders" switch. Only reachable where the access can be
 * missing (API 31+); if an OEM ships without that page, the app's details page is the
 * closest the user can get to it.
 */
fun openExactAlarmSettings(context: Context) {
    val packageUri = Uri.parse("package:${context.packageName}")
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        openAppDetails(context, packageUri)
        return
    }
    val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, packageUri)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (e: ActivityNotFoundException) {
        Log.w("ExactAlarmPrompt", "No exact-alarm settings page, opening app details", e)
        openAppDetails(context, packageUri)
    }
}

private fun openAppDetails(
    context: Context,
    packageUri: Uri,
) {
    val details = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)
    details.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(details)
}
