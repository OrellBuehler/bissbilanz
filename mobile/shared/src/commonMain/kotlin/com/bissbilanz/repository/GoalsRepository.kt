package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.Goals
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class GoalsRepository(private val api: BissbilanzApi) {
    private val _goals = MutableStateFlow<Goals?>(null)
    val goals: StateFlow<Goals?> = _goals.asStateFlow()

    suspend fun loadGoals() {
        _goals.value = api.getGoals()
    }

    suspend fun setGoals(goals: Goals): Goals {
        val updated = api.setGoals(goals)
        _goals.value = updated
        return updated
    }
}
