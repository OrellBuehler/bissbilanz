package com.bissbilanz.sync

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
sealed class SyncOperation {
    abstract val affectedTable: String?
    abstract val affectedId: String?
    abstract val description: String

    @Serializable
    @SerialName("create_food")
    data class CreateFood(
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "foods"
        override val affectedId: String? = null
        override val description = "create food"
    }

    @Serializable
    @SerialName("update_food")
    data class UpdateFood(
        val id: String,
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "foods"
        override val affectedId get() = id
        override val description get() = "update food $id"
    }

    @Serializable
    @SerialName("delete_food")
    data class DeleteFood(
        val id: String,
    ) : SyncOperation() {
        override val affectedTable = "foods"
        override val affectedId get() = id
        override val description get() = "delete food $id"
    }

    @Serializable
    @SerialName("create_entry")
    data class CreateEntry(
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "entries"
        override val affectedId: String? = null
        override val description = "create entry"
    }

    @Serializable
    @SerialName("update_entry")
    data class UpdateEntry(
        val id: String,
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "entries"
        override val affectedId get() = id
        override val description get() = "update entry $id"
    }

    @Serializable
    @SerialName("delete_entry")
    data class DeleteEntry(
        val id: String,
    ) : SyncOperation() {
        override val affectedTable = "entries"
        override val affectedId get() = id
        override val description get() = "delete entry $id"
    }

    @Serializable
    @SerialName("create_recipe")
    data class CreateRecipe(
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "recipes"
        override val affectedId: String? = null
        override val description = "create recipe"
    }

    @Serializable
    @SerialName("update_recipe")
    data class UpdateRecipe(
        val id: String,
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "recipes"
        override val affectedId get() = id
        override val description get() = "update recipe $id"
    }

    @Serializable
    @SerialName("delete_recipe")
    data class DeleteRecipe(
        val id: String,
    ) : SyncOperation() {
        override val affectedTable = "recipes"
        override val affectedId get() = id
        override val description get() = "delete recipe $id"
    }

    @Serializable
    @SerialName("set_goals")
    data class SetGoals(
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "goals"
        override val affectedId: String? = null
        override val description = "set goals"
    }

    @Serializable
    @SerialName("create_weight")
    data class CreateWeight(
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "weight"
        override val affectedId: String? = null
        override val description = "create weight entry"
    }

    @Serializable
    @SerialName("update_weight")
    data class UpdateWeight(
        val id: String,
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "weight"
        override val affectedId get() = id
        override val description get() = "update weight entry $id"
    }

    @Serializable
    @SerialName("delete_weight")
    data class DeleteWeight(
        val id: String,
    ) : SyncOperation() {
        override val affectedTable = "weight"
        override val affectedId get() = id
        override val description get() = "delete weight entry $id"
    }

    @Serializable
    @SerialName("create_supplement")
    data class CreateSupplement(
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "supplements"
        override val affectedId: String? = null
        override val description = "create supplement"
    }

    @Serializable
    @SerialName("update_supplement")
    data class UpdateSupplement(
        val id: String,
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "supplements"
        override val affectedId get() = id
        override val description get() = "update supplement $id"
    }

    @Serializable
    @SerialName("delete_supplement")
    data class DeleteSupplement(
        val id: String,
    ) : SyncOperation() {
        override val affectedTable = "supplements"
        override val affectedId get() = id
        override val description get() = "delete supplement $id"
    }

    @Serializable
    @SerialName("log_supplement")
    data class LogSupplement(
        val supplementId: String,
        val date: String?,
    ) : SyncOperation() {
        override val affectedTable = "supplements"
        override val affectedId get() = supplementId
        override val description get() = "log supplement $supplementId"
    }

    @Serializable
    @SerialName("unlog_supplement")
    data class UnlogSupplement(
        val supplementId: String,
        val date: String,
    ) : SyncOperation() {
        override val affectedTable = "supplements"
        override val affectedId get() = supplementId
        override val description get() = "unlog supplement $supplementId"
    }

    @Serializable
    @SerialName("update_preferences")
    data class UpdatePreferences(
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "preferences"
        override val affectedId: String? = null
        override val description = "update preferences"
    }

    @Serializable
    @SerialName("create_sleep")
    data class CreateSleep(
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "sleep"
        override val affectedId: String? = null
        override val description = "create sleep entry"
    }

    @Serializable
    @SerialName("update_sleep")
    data class UpdateSleep(
        val id: String,
        val body: String,
    ) : SyncOperation() {
        override val affectedTable = "sleep"
        override val affectedId get() = id
        override val description get() = "update sleep entry $id"
    }

    @Serializable
    @SerialName("delete_sleep")
    data class DeleteSleep(
        val id: String,
    ) : SyncOperation() {
        override val affectedTable = "sleep"
        override val affectedId get() = id
        override val description get() = "delete sleep entry $id"
    }
}
