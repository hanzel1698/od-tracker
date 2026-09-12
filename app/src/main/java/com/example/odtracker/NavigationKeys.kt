package com.example.odtracker

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable
data object Dashboard : NavKey

@Serializable
data class AddEditOd(val id: Long? = null) : NavKey

@Serializable
data class OdDetail(val id: Long) : NavKey
