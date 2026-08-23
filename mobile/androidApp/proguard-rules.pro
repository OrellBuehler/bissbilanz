-keepattributes *Annotation*, InnerClasses
-keepattributes Signature, Exception

# kotlinx.serialization
-keepclassmembers class kotlinx.serialization.json.** { *** *; }
-keepclasseswithmembers class * {
    @kotlinx.serialization.Serializable <fields>;
}
-keep class kotlinx.serialization.** { *; }
-keepclassmembers @kotlinx.serialization.Serializable class ** {
    *** Companion;
    *** serializer(...);
    kotlinx.serialization.KSerializer serializer(...);
}
# serializer() lives on the generated Companion object, which is NOT itself
# annotated @Serializable — the rule above never matches it, so R8 strips it
# from any class not covered by a blanket -keep and runtime lookup fails with
# "Serializer for class ... is not found". Official kotlinx.serialization rules:
-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
}
-if @kotlinx.serialization.Serializable class ** {
    static **$* *;
}
-keepclassmembers class <2>$<3> {
    kotlinx.serialization.KSerializer serializer(...);
}
-if @kotlinx.serialization.Serializable class ** {
    public static ** INSTANCE;
}
-keepclassmembers class <1> {
    public static <1> INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.bissbilanz.**$$serializer { *; }
-keepclassmembers class ** {
    @kotlinx.serialization.SerialName *;
    @kotlinx.serialization.Transient *;
}

# Ktor
-keep class io.ktor.** { *; }
-keepclassmembers class io.ktor.** { volatile <fields>; }
-dontwarn io.ktor.**

# Koin
-keep class org.koin.** { *; }
-keepclassmembers class * {
    @org.koin.core.annotation.* *;
}
-dontwarn org.koin.**

# Generated API model classes
-keep class com.bissbilanz.api.generated.model.** { *; }

# App model and sync classes (serialized to/from JSON and SQLite)
-keep class com.bissbilanz.model.** { *; }
-keep class com.bissbilanz.sync.SyncOperation** { *; }

# Glance widgets
-keep class androidx.glance.** { *; }
-dontwarn androidx.glance.**

# SQLDelight
-keep class com.squareup.sqldelight.** { *; }
-keep class app.cash.sqldelight.** { *; }
-dontwarn app.cash.sqldelight.**
