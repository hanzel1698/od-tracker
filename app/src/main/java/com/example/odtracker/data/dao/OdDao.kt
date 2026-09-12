package com.example.odtracker.data.dao

import androidx.room.*
import com.example.odtracker.data.model.OdAccount
import com.example.odtracker.data.model.OdTransaction
import com.example.odtracker.data.model.OdAccountWithTransactions
import kotlinx.coroutines.flow.Flow

@Dao
interface OdDao {
    @Query("SELECT * FROM od_accounts")
    fun getAllAccountsFlow(): Flow<List<OdAccount>>

    @Transaction
    @Query("SELECT * FROM od_accounts")
    fun getAllAccountsWithTransactionsFlow(): Flow<List<OdAccountWithTransactions>>

    @Transaction
    @Query("SELECT * FROM od_accounts WHERE id = :id")
    fun getAccountWithTransactionsFlow(id: Long): Flow<List<OdAccountWithTransactions>>

    @Query("SELECT * FROM od_accounts WHERE id = :id")
    suspend fun getAccountById(id: Long): OdAccount?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAccount(account: OdAccount): Long

    @Update
    suspend fun updateAccount(account: OdAccount)

    @Delete
    suspend fun deleteAccount(account: OdAccount)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransaction(transaction: OdTransaction): Long

    @Update
    suspend fun updateTransaction(transaction: OdTransaction)

    @Delete
    suspend fun deleteTransaction(transaction: OdTransaction)

    @Query("SELECT * FROM od_transactions WHERE odId = :odId ORDER BY date DESC")
    fun getTransactionsForAccountFlow(odId: Long): Flow<List<OdTransaction>>
}
