package com.example.odtracker.ui.screens

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.odtracker.data.database.OdDatabase
import com.example.odtracker.data.OdRepository
import com.example.odtracker.data.model.OdAccountWithTransactions
import com.example.odtracker.ui.components.PdfSettingsDialog
import com.example.odtracker.ui.viewmodel.OdViewModel
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onNavigateToAddOd: () -> Unit,
    onNavigateToEditOd: (Long) -> Unit,
    onNavigateToDetails: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val viewModel: OdViewModel = viewModel {
        val database = OdDatabase.getDatabase(context)
        val repository = OdRepository(database.odDao())
        OdViewModel(repository)
    }

    val accountsWithTx by viewModel.odAccounts.collectAsState()
    val selectedOdIds by viewModel.selectedOdIdsForPdf.collectAsState()

    var selectedTab by remember { mutableIntStateOf(0) } // 0 = Active, 1 = Closed
    var isPdfSelectionMode by remember { mutableStateOf(false) }
    var showSettingsDialog by remember { mutableStateOf(false) }
    var showPromptSettingsDialogBeforePdf by remember { mutableStateOf(false) }

    val currencyFormatter = remember { NumberFormat.getCurrencyInstance(Locale("en", "IN")) }
    val dateFormatter = remember { SimpleDateFormat("d MMM yyyy", Locale.getDefault()) }

    val activeAccounts = accountsWithTx.filter { it.account.status == "ACTIVE" }
    val closedAccounts = accountsWithTx.filter { it.account.status == "CLOSED" }
    val displayedAccounts = if (selectedTab == 0) activeAccounts else closedAccounts

    // Calculate aggregated metrics
    val totalLimit = activeAccounts.sumOf { it.account.approvedLimit }
    val totalOutstanding = activeAccounts.sumOf { it.currentOutstanding }
    val totalAvailable = (totalLimit - totalOutstanding).coerceAtLeast(0.0)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("OD Tracker") },
                actions = {
                    IconButton(onClick = { showSettingsDialog = true }) {
                        Icon(imageVector = Icons.Default.Settings, contentDescription = "PDF Settings")
                    }
                    IconButton(
                        onClick = {
                            isPdfSelectionMode = !isPdfSelectionMode
                            if (!isPdfSelectionMode) {
                                viewModel.clearSelectedOdsForPdf()
                            }
                        }
                    ) {
                        Icon(
                            imageVector = if (isPdfSelectionMode) Icons.Default.Close else Icons.Default.Description,
                            contentDescription = "PDF Selection Mode",
                            tint = if (isPdfSelectionMode) MaterialTheme.colorScheme.error else LocalContentColor.current
                        )
                    }
                }
            )
        },
        floatingActionButton = {
            if (!isPdfSelectionMode) {
                FloatingActionButton(onClick = onNavigateToAddOd) {
                    Icon(imageVector = Icons.Default.Add, contentDescription = "Add Overdraft")
                }
            }
        },
        bottomBar = {
            if (isPdfSelectionMode) {
                BottomAppBar(
                    actions = {
                        Text(
                            text = "${selectedOdIds.size} ODs Selected",
                            modifier = Modifier.padding(start = 16.dp),
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Bold
                        )
                    },
                    floatingActionButton = {
                        ExtendedFloatingActionButton(
                            text = { Text("Generate PDF") },
                            icon = { Icon(Icons.Default.PictureAsPdf, contentDescription = null) },
                            onClick = {
                                val sharedPrefs = context.getSharedPreferences("pdf_settings", Context.MODE_PRIVATE)
                                val userName = sharedPrefs.getString("user_name", "") ?: ""
                                val cifNo = sharedPrefs.getString("cif_no", "") ?: ""
                                val savingsAccountNo = sharedPrefs.getString("savings_account_no", "") ?: ""

                                if (userName.isBlank() || cifNo.isBlank() || savingsAccountNo.isBlank()) {
                                    showPromptSettingsDialogBeforePdf = true
                                } else {
                                    val selectedAccountsList = accountsWithTx.filter { selectedOdIds.contains(it.account.id) }
                                    if (selectedAccountsList.isEmpty()) {
                                        Toast.makeText(context, "Please select at least one OD", Toast.LENGTH_SHORT).show()
                                    } else {
                                        val bankName = sharedPrefs.getString("bank_name", "") ?: ""
                                        val branchName = sharedPrefs.getString("branch_name", "") ?: ""
                                        val branchAddress = sharedPrefs.getString("branch_address", "") ?: ""
                                        val place = sharedPrefs.getString("place", "") ?: ""
                                        val todayStr = dateFormatter.format(Date())

                                        val file = viewModel.generatePdf(
                                            context = context,
                                            bankName = bankName,
                                            branchName = branchName,
                                            branchAddress = branchAddress,
                                            userName = userName,
                                            cifNo = cifNo,
                                            savingsAccountNo = savingsAccountNo,
                                            place = place,
                                            date = todayStr,
                                            selectedAccounts = selectedAccountsList
                                        )

                                        if (file != null) {
                                            try {
                                                val uri = FileProvider.getUriForFile(
                                                    context,
                                                    "com.example.odtracker.fileprovider",
                                                    file
                                                )
                                                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                                    type = "application/pdf"
                                                    putExtra(Intent.EXTRA_STREAM, uri)
                                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                                }
                                                context.startActivity(Intent.createChooser(shareIntent, "Share Closure Request"))
                                                isPdfSelectionMode = false
                                                viewModel.clearSelectedOdsForPdf()
                                            } catch (e: Exception) {
                                                Toast.makeText(context, "Error sharing PDF: ${e.message}", Toast.LENGTH_LONG).show()
                                            }
                                        } else {
                                            Toast.makeText(context, "Failed to generate PDF", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                }
                            },
                            expanded = selectedOdIds.isNotEmpty()
                        )
                    }
                )
            }
        },
        modifier = modifier
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // General metrics overview
            if (!isPdfSelectionMode) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            "Overall Portfolio Status",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text("Total Limit", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f))
                                Text(currencyFormatter.format(totalLimit), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                            }
                            Column {
                                Text("Outstanding", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f))
                                Text(currencyFormatter.format(totalOutstanding), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("Available Balance", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f))
                                Text(currencyFormatter.format(totalAvailable), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color(0xFF2E7D32))
                            }
                        }
                    }
                }
            }

            // Tab Row
            TabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Active (${activeAccounts.size})") }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Closed (${closedAccounts.size})") }
                )
            }

            // List of items
            if (displayedAccounts.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "No Overdraft Accounts found",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(displayedAccounts, key = { it.account.id }) { od ->
                        val isSelected = selectedOdIds.contains(od.account.id)
                        val outstanding = od.currentOutstanding
                        val limit = od.account.approvedLimit
                        val usageRatio = if (limit > 0) (outstanding / limit).coerceIn(0.0, 1.0) else 0.0

                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    if (isPdfSelectionMode) {
                                        viewModel.toggleSelectOdForPdf(od.account.id)
                                    } else {
                                        onNavigateToDetails(od.account.id)
                                    }
                                },
                            colors = CardDefaults.cardColors(
                                containerColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f) else MaterialTheme.colorScheme.surface
                            )
                        ) {
                            Row(
                                modifier = Modifier.padding(16.dp).fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (isPdfSelectionMode) {
                                    Checkbox(
                                        checked = isSelected,
                                        onCheckedChange = { viewModel.toggleSelectOdForPdf(od.account.id) },
                                        modifier = Modifier.padding(end = 8.dp)
                                    )
                                }

                                Column(modifier = Modifier.weight(1f)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text("OD: ${od.account.odNumber}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                        Text("Interest: ${od.account.interestRate}%", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Text("Linked FD: ${od.account.underlyingFdNo}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Spacer(modifier = Modifier.height(8.dp))

                                    // Limit bar
                                    LinearProgressIndicator(
                                        progress = { usageRatio.toFloat() },
                                        modifier = Modifier.fillMaxWidth().height(4.dp),
                                        color = if (usageRatio > 0.85) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text("Outstanding: ${currencyFormatter.format(outstanding)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                                        Text("Limit: ${currencyFormatter.format(limit)}", style = MaterialTheme.typography.bodySmall)
                                    }
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text("Maturity: ${dateFormatter.format(Date(od.account.fdMaturityDate))}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text("${od.remainingDays} days left", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = if (od.remainingDays < 30) MaterialTheme.colorScheme.error else Color.Unspecified)
                                    }
                                }

                                if (!isPdfSelectionMode) {
                                    Box {
                                        var showMenu by remember { mutableStateOf(false) }
                                        IconButton(onClick = { showMenu = true }) {
                                            Icon(imageVector = Icons.Default.MoreVert, contentDescription = "Actions")
                                        }
                                        DropdownMenu(
                                            expanded = showMenu,
                                            onDismissRequest = { showMenu = false }
                                        ) {
                                            DropdownMenuItem(
                                                text = { Text("Edit") },
                                                onClick = {
                                                    showMenu = false
                                                    onNavigateToEditOd(od.account.id)
                                                }
                                            )
                                            DropdownMenuItem(
                                                text = { Text("Delete") },
                                                onClick = {
                                                    showMenu = false
                                                    viewModel.deleteOdAccount(od.account)
                                                }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showSettingsDialog) {
        PdfSettingsDialog(
            onDismiss = { showSettingsDialog = false },
            onSave = { showSettingsDialog = false }
        )
    }

    if (showPromptSettingsDialogBeforePdf) {
        AlertDialog(
            onDismissRequest = { showPromptSettingsDialogBeforePdf = false },
            title = { Text("Missing Settings") },
            text = { Text("Please configure your full name, CIF number, and Savings account number in Settings to generate the closure request PDF.") },
            confirmButton = {
                Button(
                    onClick = {
                        showPromptSettingsDialogBeforePdf = false
                        showSettingsDialog = true
                    }
                ) {
                    Text("Go to Settings")
                }
            },
            dismissButton = {
                TextButton(onClick = { showPromptSettingsDialogBeforePdf = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}
