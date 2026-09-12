package com.example.odtracker.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.PrimaryKey

@Entity(
    tableName = "od_transactions",
    foreignKeys = [
        ForeignKey(
            entity = OdAccount::class,
            parentColumns = ["id"],
            childColumns = ["odId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class OdTransaction(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val odId: Long,
    val type: String, // "WITHDRAWAL", "REPAYMENT", "INTEREST"
    val amount: Double,
    val date: Long, // Epoch millis
    val notes: String = ""
)
