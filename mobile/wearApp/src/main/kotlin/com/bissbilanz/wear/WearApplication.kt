package com.bissbilanz.wear

import android.app.Application
import io.sentry.Sentry
import io.sentry.android.core.SentryAndroid

class WearApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        if (BuildConfig.SENTRY_DSN.isNotBlank()) {
            SentryAndroid.init(this) { options ->
                options.dsn = BuildConfig.SENTRY_DSN
                options.isAnrEnabled = true
                options.environment = if (BuildConfig.DEBUG) "development" else "production"
                // The watch shares the phone's applicationId and version code, so the
                // default release name would merge both apps into one Sentry release.
                options.release = "$packageName.wear@${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}"
            }
            Sentry.setTag("app", "wear")
        }
    }
}
