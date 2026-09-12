package com.example.odtracker.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "od_accounts")
data class OdAccount(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val odNumber: String,
    val approvedLimit: Double,
    val underlyingFdNo: String,
    val fdMaturityDate: Long, // Epoch millis
    val interestRate: Double,
    val status: String = "ACTIVE", // "ACTIVE" or "CLOSED"
    val lienRemoved: Boolean = false
)
