package com.example.odtracker.data

import com.example.odtracker.data.dao.OdDao
import com.example.odtracker.data.model.OdAccount
import com.example.odtracker.data.model.OdTransaction
import com.example.odtracker.data.model.OdAccountWithTransactions
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class OdRepository(private val odDao: OdDao) {
    val allAccountsWithTransactions: Flow<List<OdAccountWithTransactions>> = odDao.getAllAccountsWithTransactionsFlow()

    fun getAccountWithTransactions(id: Long): Flow<OdAccountWithTransactions?> =
        odDao.getAccountWithTransactionsFlow(id).map { it.firstOrNull() }

    suspend fun getAccountById(id: Long): OdAccount? = odDao.getAccountById(id)

    suspend fun insertAccount(account: OdAccount): Long = odDao.insertAccount(account)

    suspend fun updateAccount(account: OdAccount) = odDao.updateAccount(account)

    suspend fun deleteAccount(account: OdAccount) = odDao.deleteAccount(account)

    suspend fun insertTransaction(transaction: OdTransaction): Long = odDao.insertTransaction(transaction)

    suspend fun updateTransaction(transaction: OdTransaction) = odDao.updateTransaction(transaction)

    suspend fun deleteTransaction(transaction: OdTransaction) = odDao.deleteTransaction(transaction)
}
