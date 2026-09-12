package com.example.odtracker.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.odtracker.data.database.OdDatabase
import com.example.odtracker.data.OdRepository
import com.example.odtracker.data.model.OdTransaction
import com.example.odtracker.ui.viewmodel.OdViewModel
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OdDetailScreen(
    odId: Long,
    onNavigateBack: () -> Unit,
    onNavigateToEditOd: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val viewModel: OdViewModel = viewModel {
        val database = OdDatabase.getDatabase(context)
        val repository = OdRepository(database.odDao())
        OdViewModel(repository)
    }

    val accountWithTransactionsState by viewModel.getAccountWithTransactions(odId).collectAsState(initial = null)

    var showTxDialog by remember { mutableStateOf(false) }
    var txTypeForDialog by remember { mutableStateOf("WITHDRAWAL") }

    val currencyFormatter = remember { NumberFormat.getCurrencyInstance(Locale("en", "IN")) }
    val dateFormatter = remember { SimpleDateFormat("d MMM yyyy", Locale.getDefault()) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Overdraft Details") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { onNavigateToEditOd(odId) }) {
                        Icon(imageVector = Icons.Default.Edit, contentDescription = "Edit")
                    }
                }
            )
        },
        modifier = modifier
    ) { padding ->
        val state = accountWithTransactionsState
        if (state == null) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            val account = state.account
            val transactions = state.transactions
            val outstanding = state.currentOutstanding
            val available = state.availableLimit
            val limit = account.approvedLimit
            val usageRatio = if (limit > 0) (outstanding / limit).coerceIn(0.0, 1.0) else 0.0

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Utilization Card
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Limit Utilization", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text("${(usageRatio * 100).toInt()}% Used", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
                        }

                        LinearProgressIndicator(
                            progress = { usageRatio.toFloat() },
                            modifier = Modifier.fillMaxWidth().height(8.dp),
                            color = if (usageRatio > 0.85) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text("Outstanding", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(currencyFormatter.format(outstanding), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("Available Balance", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(currencyFormatter.format(available), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = Color(0xFF4CAF50))
                            }
                        }
                    }
                }

                // Account Details Card
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
                    )
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        DetailRow("OD Account No.", account.odNumber)
                        DetailRow("Linked FD No.", account.underlyingFdNo)
                        DetailRow("Approved Limit", currencyFormatter.format(account.approvedLimit))
                        DetailRow("Interest Rate", "${account.interestRate}%")
                        DetailRow("Maturity Date", dateFormatter.format(Date(account.fdMaturityDate)))
                        DetailRow("Days to Maturity", "${state.remainingDays} days")
                        
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Status", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            SuggestionChip(
                                onClick = {},
                                label = { Text(account.status) },
                                colors = SuggestionChipDefaults.suggestionChipColors(
                                    containerColor = if (account.status == "ACTIVE") Color(0xFFE8F5E9) else Color(0xFFFFEBEE),
                                    labelColor = if (account.status == "ACTIVE") Color(0xFF2E7D32) else Color(0xFFC62828)
                                )
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Lien on FD", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            SuggestionChip(
                                onClick = {},
                                label = { Text(if (account.lienRemoved) "Lien Removed" else "Lien Active") },
                                colors = SuggestionChipDefaults.suggestionChipColors(
                                    containerColor = if (account.lienRemoved) Color(0xFFE8F5E9) else Color(0xFFFFF3E0),
                                    labelColor = if (account.lienRemoved) Color(0xFF2E7D32) else Color(0xFFEF6C00)
                                )
                            )
                        }
                    }
                }

                // Actions Section
                Text("Log Funds Transfer", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = {
                            txTypeForDialog = "WITHDRAWAL"
                            showTxDialog = true
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.Remove, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Withdraw", maxLines = 1)
                    }

                    Button(
                        onClick = {
                            txTypeForDialog = "REPAYMENT"
                            showTxDialog = true
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50)),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Repay", maxLines = 1)
                    }

                    Button(
                        onClick = {
                            txTypeForDialog = "INTEREST"
                            showTxDialog = true
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.Percent, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Interest", maxLines = 1)
                    }
                }

                // Transactions History Header
                Text("Transaction History", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)

                if (transactions.isEmpty()) {
                    Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                        Text("No transactions logged yet", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxWidth().weight(1f),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(transactions) { tx ->
                            TransactionItem(
                                transaction = tx,
                                currencyFormatter = currencyFormatter,
                                dateFormatter = dateFormatter,
                                onDelete = { viewModel.deleteTransaction(tx) }
                            )
                        }
                    }
                }
            }
        }
    }

    if (showTxDialog) {
        AddTransactionDialog(
            txType = txTypeForDialog,
            onDismiss = { showTxDialog = false },
            onSave = { amount, date, notes ->
                viewModel.addTransaction(
                    odId = odId,
                    type = txTypeForDialog,
                    amount = amount,
                    date = date,
                    notes = notes
                )
                showTxDialog = false
            }
        )
    }
}

@Composable
fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun TransactionItem(
    transaction: OdTransaction,
    currencyFormatter: NumberFormat,
    dateFormatter: SimpleDateFormat,
    onDelete: () -> Unit
) {
    val color = when (transaction.type) {
        "WITHDRAWAL" -> MaterialTheme.colorScheme.error
        "REPAYMENT" -> Color(0xFF4CAF50)
        else -> MaterialTheme.colorScheme.secondary
    }
    val prefix = when (transaction.type) {
        "WITHDRAWAL", "INTEREST" -> "-"
        else -> "+"
    }
    val typeLabel = when (transaction.type) {
        "WITHDRAWAL" -> "Withdrawal"
        "REPAYMENT" -> "Repayment"
        else -> "Interest Debit"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier.padding(12.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .padding(end = 4.dp)
                    )
                    Text(typeLabel, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = color)
                }
                Text(dateFormatter.format(Date(transaction.date)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (transaction.notes.isNotBlank()) {
                    Text(transaction.notes, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "$prefix ${currencyFormatter.format(transaction.amount)}",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold,
                    color = color,
                    modifier = Modifier.padding(end = 8.dp)
                )
                IconButton(onClick = onDelete, modifier = Modifier.size(24.dp)) {
                    Icon(imageVector = Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddTransactionDialog(
    txType: String,
    onDismiss: () -> Unit,
    onSave: (amount: Double, date: Long, notes: String) -> Unit
) {
    var amount by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var dateMillis by remember { mutableStateOf(System.currentTimeMillis()) }
    var showDatePicker by remember { mutableStateOf(false) }

    val dateFormatter = remember { SimpleDateFormat("d MMM yyyy", Locale.getDefault()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            val title = when (txType) {
                "WITHDRAWAL" -> "Withdraw Funds"
                "REPAYMENT" -> "Repay Funds"
                else -> "Interest Debit"
            }
            Text(title)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it },
                    label = { Text("Amount (₹)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = dateFormatter.format(Date(dateMillis)),
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Transaction Date") },
                    trailingIcon = {
                        Icon(
                            imageVector = Icons.Default.CalendarToday,
                            contentDescription = "Select Date",
                            modifier = Modifier.clickable { showDatePicker = true }
                        )
                    },
                    modifier = Modifier.fillMaxWidth().clickable { showDatePicker = true }
                )

                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Description / Notes (Optional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val amt = amount.toDoubleOrNull()
                    if (amt != null && amt > 0) {
                        onSave(amt, dateMillis, notes.trim())
                    }
                },
                enabled = amount.toDoubleOrNull() != null && amount.toDouble() > 0
            ) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )

    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(initialSelectedDateMillis = dateMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        dateMillis = datePickerState.selectedDateMillis ?: System.currentTimeMillis()
                        showDatePicker = false
                    }
                ) {
                    Text("OK")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text("Cancel")
                }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
}
