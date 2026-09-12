package com.example.odtracker.data.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.example.odtracker.data.dao.OdDao
import com.example.odtracker.data.model.OdAccount
import com.example.odtracker.data.model.OdTransaction

@Database(entities = [OdAccount::class, OdTransaction::class], version = 1, exportSchema = false)
abstract class OdDatabase : RoomDatabase() {
    abstract fun odDao(): OdDao

    companion object {
        @Volatile
        private var INSTANCE: OdDatabase? = null

        fun getDatabase(context: Context): OdDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    OdDatabase::class.java,
                    "od_tracker_db"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
