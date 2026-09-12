package com.example.odtracker.data.model

import androidx.room.Embedded
import androidx.room.Relation

data class OdAccountWithTransactions(
    @Embedded val account: OdAccount,
    @Relation(
        parentColumn = "id",
        entityColumn = "odId"
    )
    val transactions: List<OdTransaction>
) {
    val currentOutstanding: Double
        get() {
            var outstanding = 0.0
            for (tx in transactions) {
                when (tx.type) {
                    "WITHDRAWAL", "INTEREST" -> outstanding += tx.amount
                    "REPAYMENT" -> outstanding -= tx.amount
                }
            }
            return outstanding
        }

    val availableLimit: Double
        get() = (account.approvedLimit - currentOutstanding).coerceAtLeast(0.0)

    val remainingDays: Long
        get() {
            val diff = account.fdMaturityDate - System.currentTimeMillis()
            return if (diff < 0) 0L else diff / (1000 * 60 * 60 * 24)
        }
}
