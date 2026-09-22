import Foundation

// New strings for voice meal logging (`VoiceMealLogView.swift`), kept in their
// own file rather than appended to `WatchStrings.swift` to avoid merge
// conflicts with other features landing in that shared file at the same time.
extension WatchStrings {
    private var isGermanLocale: Bool {
        localeCode == "de"
    }

    var voiceLog: String {
        isGermanLocale ? "Per Sprache" : "Voice Log"
    }

    var voiceLogTitle: String {
        isGermanLocale ? "Mahlzeit einsprechen" : "Log by Voice"
    }

    var voiceLogPlaceholder: String {
        isGermanLocale ? "Was hast du gegessen?" : "What did you eat?"
    }

    var voiceLogEstimate: String {
        isGermanLocale ? "Schätzen" : "Estimate"
    }

    var voiceLogEstimating: String {
        isGermanLocale ? "Wird geschätzt…" : "Estimating…"
    }

    var voiceLogFailed: String {
        isGermanLocale ? "Schätzung fehlgeschlagen" : "Couldn't estimate that"
    }

    var ok: String {
        "OK"
    }
}
