package com.example.odtracker.ui.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.odtracker.data.OdRepository
import com.example.odtracker.data.model.OdAccount
import com.example.odtracker.data.model.OdTransaction
import com.example.odtracker.data.model.OdAccountWithTransactions
import com.example.odtracker.utils.PdfGenerator
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.File

class OdViewModel(private val repository: OdRepository) : ViewModel() {

    val odAccounts: StateFlow<List<OdAccountWithTransactions>> =
        repository.allAccountsWithTransactions
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _selectedOdIdsForPdf = MutableStateFlow<Set<Long>>(emptySet())
    val selectedOdIdsForPdf: StateFlow<Set<Long>> = _selectedOdIdsForPdf.asStateFlow()

    fun toggleSelectOdForPdf(id: Long) {
        val current = _selectedOdIdsForPdf.value
        _selectedOdIdsForPdf.value = if (current.contains(id)) {
            current - id
        } else {
            current + id
        }
    }

    fun clearSelectedOdsForPdf() {
        _selectedOdIdsForPdf.value = emptySet()
    }

    fun getAccountWithTransactions(id: Long): Flow<OdAccountWithTransactions?> {
        return repository.getAccountWithTransactions(id)
    }

    fun saveOdAccount(
        id: Long = 0,
        odNumber: String,
        approvedLimit: Double,
        underlyingFdNo: String,
        fdMaturityDate: Long,
        interestRate: Double,
        status: String = "ACTIVE",
        lienRemoved: Boolean = false
    ) {
        viewModelScope.launch {
            val account = OdAccount(
                id = id,
                odNumber = odNumber,
                approvedLimit = approvedLimit,
                underlyingFdNo = underlyingFdNo,
                fdMaturityDate = fdMaturityDate,
                interestRate = interestRate,
                status = status,
                lienRemoved = lienRemoved
            )
            if (id == 0L) {
                repository.insertAccount(account)
            } else {
                repository.updateAccount(account)
            }
        }
    }

    fun deleteOdAccount(account: OdAccount) {
        viewModelScope.launch {
            repository.deleteAccount(account)
        }
    }

    fun addTransaction(odId: Long, type: String, amount: Double, date: Long, notes: String) {
        viewModelScope.launch {
            val transaction = OdTransaction(
                odId = odId,
                type = type,
                amount = amount,
                date = date,
                notes = notes
            )
            repository.insertTransaction(transaction)
        }
    }

    fun deleteTransaction(transaction: OdTransaction) {
        viewModelScope.launch {
            repository.deleteTransaction(transaction)
        }
    }

    fun generatePdf(
        context: Context,
        bankName: String,
        branchName: String,
        branchAddress: String,
        userName: String,
        cifNo: String,
        savingsAccountNo: String,
        place: String,
        date: String,
        selectedAccounts: List<OdAccountWithTransactions>
    ): File? {
        return PdfGenerator.generateClosureRequestPdf(
            context = context,
            bankName = bankName,
            branchName = branchName,
            branchAddress = branchAddress,
            userName = userName,
            cifNo = cifNo,
            savingsAccountNo = savingsAccountNo,
            place = place,
            date = date,
            selectedOds = selectedAccounts
        )
    }
}
