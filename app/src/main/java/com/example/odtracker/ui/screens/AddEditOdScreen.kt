package com.example.odtracker.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.odtracker.data.database.OdDatabase
import com.example.odtracker.data.OdRepository
import com.example.odtracker.ui.viewmodel.OdViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddEditOdScreen(
    odId: Long?,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val viewModel: OdViewModel = viewModel {
        val database = OdDatabase.getDatabase(context)
        val repository = OdRepository(database.odDao())
        OdViewModel(repository)
    }

    var odNumber by remember { mutableStateOf("") }
    var approvedLimit by remember { mutableStateOf("") }
    var underlyingFdNo by remember { mutableStateOf("") }
    var fdMaturityDate by remember { mutableStateOf<Long?>(null) }
    var interestRate by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("ACTIVE") }
    var lienRemoved by remember { mutableStateOf(false) }

    var showDatePicker by remember { mutableStateOf(false) }

    // Pre-populate if editing
    if (odId != null && odId != 0L) {
        val accountState by viewModel.getAccountWithTransactions(odId).collectAsState(initial = null)
        LaunchedEffect(accountState) {
            accountState?.account?.let { account ->
                odNumber = account.odNumber
                approvedLimit = account.approvedLimit.toString()
                underlyingFdNo = account.underlyingFdNo
                fdMaturityDate = account.fdMaturityDate
                interestRate = account.interestRate.toString()
                status = account.status
                lienRemoved = account.lienRemoved
            }
        }
    }

    val isFormValid = odNumber.isNotBlank() &&
            underlyingFdNo.isNotBlank() &&
            approvedLimit.toDoubleOrNull() != null &&
            interestRate.toDoubleOrNull() != null &&
            fdMaturityDate != null

    val dateFormatter = remember { SimpleDateFormat("d MMM yyyy", Locale.getDefault()) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (odId == null || odId == 0L) "Add Overdraft" else "Edit Overdraft") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        },
        modifier = modifier
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedTextField(
                value = odNumber,
                onValueChange = { odNumber = it },
                label = { Text("OD Account Number") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = approvedLimit,
                onValueChange = { approvedLimit = it },
                label = { Text("Approved OD Limit (₹)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = underlyingFdNo,
                onValueChange = { underlyingFdNo = it },
                label = { Text("Underlying FD Number") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = interestRate,
                onValueChange = { interestRate = it },
                label = { Text("Interest Rate %") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            // Date picker field
            OutlinedTextField(
                value = fdMaturityDate?.let { dateFormatter.format(Date(it)) } ?: "",
                onValueChange = {},
                readOnly = true,
                label = { Text("FD Maturity Date") },
                trailingIcon = {
                    Icon(
                        imageVector = Icons.Default.CalendarToday,
                        contentDescription = "Select Date",
                        modifier = Modifier.clickable { showDatePicker = true }
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showDatePicker = true }
            )

            if (odId != null && odId != 0L) {
                // Status selection
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("OD Status", style = MaterialTheme.typography.bodyLarge)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                            selected = status == "ACTIVE",
                            onClick = { status = "ACTIVE" }
                        )
                        Text("Active", modifier = Modifier.padding(end = 16.dp))
                        RadioButton(
                            selected = status == "CLOSED",
                            onClick = { status = "CLOSED" }
                        )
                        Text("Closed")
                    }
                }

                // Lien status
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Lien Removed", style = MaterialTheme.typography.bodyLarge)
                    Switch(
                        checked = lienRemoved,
                        onCheckedChange = { lienRemoved = it }
                    )
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            Button(
                onClick = {
                    if (isFormValid) {
                        viewModel.saveOdAccount(
                            id = odId ?: 0L,
                            odNumber = odNumber.trim(),
                            approvedLimit = approvedLimit.toDouble(),
                            underlyingFdNo = underlyingFdNo.trim(),
                            fdMaturityDate = fdMaturityDate!!,
                            interestRate = interestRate.toDouble(),
                            status = status,
                            lienRemoved = lienRemoved
                        )
                        onNavigateBack()
                    }
                },
                enabled = isFormValid,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
            ) {
                Text("Save Overdraft", style = MaterialTheme.typography.titleMedium)
            }
        }
    }

    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = fdMaturityDate ?: System.currentTimeMillis()
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        fdMaturityDate = datePickerState.selectedDateMillis
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
