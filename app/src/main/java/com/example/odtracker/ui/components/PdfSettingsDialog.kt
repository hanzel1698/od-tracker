package com.example.odtracker.ui.components

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

@Composable
fun PdfSettingsDialog(
    onDismiss: () -> Unit,
    onSave: () -> Unit
) {
    val context = LocalContext.current
    val sharedPrefs = remember { context.getSharedPreferences("pdf_settings", Context.MODE_PRIVATE) }

    var bankName by remember { mutableStateOf(sharedPrefs.getString("bank_name", "") ?: "") }
    var branchName by remember { mutableStateOf(sharedPrefs.getString("branch_name", "") ?: "") }
    var branchAddress by remember { mutableStateOf(sharedPrefs.getString("branch_address", "") ?: "") }
    var userName by remember { mutableStateOf(sharedPrefs.getString("user_name", "") ?: "") }
    var cifNo by remember { mutableStateOf(sharedPrefs.getString("cif_no", "") ?: "") }
    var savingsAccountNo by remember { mutableStateOf(sharedPrefs.getString("savings_account_no", "") ?: "") }
    var place by remember { mutableStateOf(sharedPrefs.getString("place", "") ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Closure PDF Settings") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    "Configure sender and bank details for generating the Closure Request PDF letter.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = userName,
                    onValueChange = { userName = it },
                    label = { Text("Your Full Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = cifNo,
                    onValueChange = { cifNo = it },
                    label = { Text("CIF No.") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = savingsAccountNo,
                    onValueChange = { savingsAccountNo = it },
                    label = { Text("Savings Account No. (for debit)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = bankName,
                    onValueChange = { bankName = it },
                    label = { Text("Bank Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = branchName,
                    onValueChange = { branchName = it },
                    label = { Text("Branch Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = branchAddress,
                    onValueChange = { branchAddress = it },
                    label = { Text("Branch City / Address") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = place,
                    onValueChange = { place = it },
                    label = { Text("Place (City, State)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    sharedPrefs.edit().apply {
                        putString("bank_name", bankName)
                        putString("branch_name", branchName)
                        putString("branch_address", branchAddress)
                        putString("user_name", userName)
                        putString("cif_no", cifNo)
                        putString("savings_account_no", savingsAccountNo)
                        putString("place", place)
                        apply()
                    }
                    onSave()
                }
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
