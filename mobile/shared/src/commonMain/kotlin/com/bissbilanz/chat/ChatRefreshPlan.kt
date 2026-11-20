package com.bissbilanz.chat

import com.bissbilanz.api.generated.model.ChatChange
import com.bissbilanz.api.generated.model.ChatMessage

/** What changed in one domain: everything, or only the listed diary days and record ids. */
data class ChatChangeScope(
    val everything: Boolean = false,
    val dates: Set<String> = emptySet(),
    val ids: Set<String> = emptySet(),
) {
    val isEmpty: Boolean get() = !everything && dates.isEmpty() && ids.isEmpty()

    operator fun plus(other: ChatChangeScope) = ChatChangeScope(everything || other.everything, dates + other.dates, ids + other.ids)

    /** What is left after [done] was refreshed: a full refresh covers any scope. */
    operator fun minus(done: ChatChangeScope): ChatChangeScope =
        if (done.everything) NONE else ChatChangeScope(everything, dates - done.dates, ids - done.ids)

    companion object {
        val NONE = ChatChangeScope()
        val EVERYTHING = ChatChangeScope(everything = true)
    }
}

/**
 * The data the assistant changed, per domain (`docs/ai-chat.md` §10), merged across events so
 * a burst of tool calls costs one refresh. A domain in `changed` without an entry in
 * `changes`, or an entry with neither dates nor ids, means the whole domain.
 */
data class ChatRefreshPlan(
    val domains: Map<String, ChatChangeScope> = emptyMap(),
) {
    val isEmpty: Boolean get() = domains.values.all { it.isEmpty }

    operator fun get(domain: String): ChatChangeScope? = domains[domain]?.takeUnless { it.isEmpty }

    operator fun plus(other: ChatRefreshPlan): ChatRefreshPlan {
        if (other.isEmpty) return this
        val merged = domains.toMutableMap()
        other.domains.forEach { (domain, scope) -> merged[domain] = (merged[domain] ?: ChatChangeScope.NONE) + scope }
        return ChatRefreshPlan(merged)
    }

    operator fun minus(done: ChatRefreshPlan): ChatRefreshPlan =
        ChatRefreshPlan(
            domains
                .mapValues { (domain, scope) -> done.domains[domain]?.let { scope - it } ?: scope }
                .filterValues { !it.isEmpty },
        )

    companion object {
        val EMPTY = ChatRefreshPlan()

        fun of(
            changed: List<String>?,
            changes: List<ChatChange>?,
        ): ChatRefreshPlan {
            val scopes = mutableMapOf<String, ChatChangeScope>()
            changes.orEmpty().forEach { change ->
                val dates = change.dates.orEmpty().toSet()
                val ids = change.ids.orEmpty().toSet()
                val scope = if (dates.isEmpty() && ids.isEmpty()) ChatChangeScope.EVERYTHING else ChatChangeScope(dates = dates, ids = ids)
                scopes[change.domain] = (scopes[change.domain] ?: ChatChangeScope.NONE) + scope
            }
            changed.orEmpty().forEach { domain -> if (domain !in scopes) scopes[domain] = ChatChangeScope.EVERYTHING }
            return ChatRefreshPlan(scopes)
        }

        /** What a run changed, read back from the tool parts of its messages (the run itself may be gone). */
        fun ofRun(
            messages: List<ChatMessage>,
            runId: String,
        ): ChatRefreshPlan =
            messages
                .filter { it.runId == runId }
                .flatMap { it.parts }
                .filter { it.type == ChatPartType.TOOL }
                .fold(EMPTY) { plan, part -> plan + of(part.changed, part.changes) }
    }
}
