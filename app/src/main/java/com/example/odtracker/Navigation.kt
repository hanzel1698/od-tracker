package com.example.odtracker

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.example.odtracker.ui.screens.DashboardScreen
import com.example.odtracker.ui.screens.OdDetailScreen
import com.example.odtracker.ui.screens.AddEditOdScreen

@Composable
fun MainNavigation() {
  val backStack = rememberNavBackStack(Dashboard)

  NavDisplay(
    backStack = backStack,
    onBack = { backStack.removeLastOrNull() },
    entryProvider =
      entryProvider {
        entry<Dashboard> {
          DashboardScreen(
            onNavigateToAddOd = { backStack.add(AddEditOd()) },
            onNavigateToEditOd = { id -> backStack.add(AddEditOd(id)) },
            onNavigateToDetails = { id -> backStack.add(OdDetail(id)) },
            modifier = Modifier.fillMaxSize()
          )
        }
        entry<AddEditOd> { key ->
          AddEditOdScreen(
            odId = key.id,
            onNavigateBack = { backStack.removeLastOrNull() },
            modifier = Modifier.fillMaxSize()
          )
        }
        entry<OdDetail> { key ->
          OdDetailScreen(
            odId = key.id,
            onNavigateBack = { backStack.removeLastOrNull() },
            onNavigateToEditOd = { id -> backStack.add(AddEditOd(id)) },
            modifier = Modifier.fillMaxSize()
          )
        }
      },
  )
}
