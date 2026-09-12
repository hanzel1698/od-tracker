# OD Tracker

A modern native Android application built with **Jetpack Compose**, **Kotlin**, and **Room Database** to track Overdrafts (ODs) taken against Fixed Deposits (FDs).

## Features

- **Overdraft & Fixed Deposit Tracking**:
  - Track OD Account Number, Approved Limit, Linked FD Number, Maturity Date, Interest Rate %, and Lien Status.
  - Interactive Material 3 Calendar DatePicker modal for maturity date selection.
  - Automatic calculation of days remaining until FD maturity.

- **Transaction Management**:
  - **Withdrawals**: Funds transferred out of the OD account (increases outstanding balance).
  - **Repayments**: Funds transferred into the OD account (reduces outstanding balance).
  - **Interest Debits**: Monthly interest debits from the bank (increases outstanding balance).

- **Real-Time Portfolio Metrics**:
  - Total Approved Limit across all active overdrafts.
  - Aggregated Outstanding balance (`withdrawals + interest - repayments`).
  - Remaining Available Limit (`approved limit - outstanding balance`).
  - Active vs. Closed account tabs with status toggles.

- **Automated Bank Closure Request Letter (PDF)**:
  - Select one or multiple overdraft accounts directly from the dashboard.
  - Automatically formats and exports a standard A4 closure request letter addressed to the bank manager requesting OD closure, lien removal, and debit authorization from a linked savings account.
  - Generates the document and triggers the Android system share sheet to view, print, or send.
  - Stores sender and branch details locally via SharedPreferences.

## Tech Stack & Architecture

- **Language**: Kotlin
- **UI Framework**: Jetpack Compose & Material 3
- **Architecture**: MVVM with Repository Pattern, StateFlow, and Coroutines
- **Navigation**: Jetpack Navigation 3
- **Local Persistence**: Room SQLite Database
- **PDF Generation**: Android native `android.graphics.pdf.PdfDocument` with `FileProvider` for secure sharing

## Getting Started

### Prerequisites
- Android Studio Ladybug or newer
- Android SDK 36 (Minimum SDK: 24)
- JDK 17

### Build & Run
Clone the repository and build the project using the Gradle wrapper:

```bash
# Assemble Debug APK
./gradlew assembleDebug

# Assemble Release APK
./gradlew assembleRelease
```
