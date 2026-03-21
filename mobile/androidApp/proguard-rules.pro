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

# Glance widgets
-keep class androidx.glance.** { *; }
-dontwarn androidx.glance.**

# SQLDelight
-keep class com.squareup.sqldelight.** { *; }
-keep class app.cash.sqldelight.** { *; }
-dontwarn app.cash.sqldelight.**
