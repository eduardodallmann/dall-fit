package com.dallfit.app.offline;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

final class OfflineStorageDatabase extends SQLiteOpenHelper {
    static final String DATABASE_NAME = "dall-fit-offline.db";
    static final int SCHEMA_VERSION = 1;

    OfflineStorageDatabase(Context context) {
        this(context, DATABASE_NAME);
    }

    OfflineStorageDatabase(Context context, String databaseName) {
        super(context, databaseName, null, SCHEMA_VERSION);
    }

    @Override
    public void onConfigure(SQLiteDatabase database) {
        database.setForeignKeyConstraintsEnabled(true);
    }

    @Override
    public void onCreate(SQLiteDatabase database) {
        createSchema(database);
    }

    @Override
    public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
        if (oldVersion == newVersion) return;
        throw new OfflineStorageException(
            "OFFLINE_STORAGE_MIGRATION_MISSING",
            "Offline storage migration is unavailable."
        );
    }

    @Override
    public void onDowngrade(SQLiteDatabase database, int oldVersion, int newVersion) {
        throw new OfflineStorageException(
            "OFFLINE_STORAGE_DOWNGRADE_UNSUPPORTED",
            "Offline storage downgrade is unavailable."
        );
    }

    private static void createSchema(SQLiteDatabase database) {
        database.execSQL(
            "CREATE TABLE engine_metadata (" +
            "id INTEGER PRIMARY KEY CHECK (id = 1)," +
            "state_revision INTEGER NOT NULL DEFAULT 0 CHECK (state_revision >= 0)," +
            "reset_generation INTEGER NOT NULL DEFAULT 0 CHECK (reset_generation >= 0)," +
            "last_recovery TEXT NULL)"
        );
        database.execSQL(
            "INSERT INTO engine_metadata (id, state_revision, reset_generation, last_recovery) " +
            "VALUES (1, 0, 0, NULL)"
        );
        database.execSQL(
            "CREATE TABLE account_state (" +
            "id INTEGER PRIMARY KEY CHECK (id = 1)," +
            "person_id TEXT NOT NULL CHECK (length(person_id) > 0))"
        );
        database.execSQL(
            "CREATE TABLE prepared_plan (" +
            "id INTEGER PRIMARY KEY CHECK (id = 1)," +
            "account_id INTEGER NOT NULL DEFAULT 1 REFERENCES account_state(id) ON DELETE CASCADE," +
            "plan_id TEXT NOT NULL CHECK (length(plan_id) > 0)," +
            "payload_version INTEGER NOT NULL CHECK (payload_version > 0)," +
            "revision INTEGER NOT NULL CHECK (revision >= 0)," +
            "payload_json TEXT NOT NULL," +
            "validated_at TEXT NOT NULL," +
            "expires_at TEXT NOT NULL," +
            "updated_at TEXT NOT NULL)"
        );
        database.execSQL(
            "CREATE TABLE active_session (" +
            "id INTEGER PRIMARY KEY CHECK (id = 1)," +
            "account_id INTEGER NOT NULL DEFAULT 1 REFERENCES account_state(id) ON DELETE CASCADE," +
            "session_id TEXT NOT NULL UNIQUE CHECK (length(session_id) > 0)," +
            "plan_id TEXT NOT NULL CHECK (length(plan_id) > 0)," +
            "payload_version INTEGER NOT NULL CHECK (payload_version > 0)," +
            "revision INTEGER NOT NULL CHECK (revision >= 0)," +
            "payload_json TEXT NOT NULL," +
            "updated_at TEXT NOT NULL)"
        );
        database.execSQL(
            "CREATE TABLE snapshots (" +
            "execution_id TEXT PRIMARY KEY CHECK (length(execution_id) > 0)," +
            "account_id INTEGER NOT NULL DEFAULT 1 REFERENCES account_state(id) ON DELETE CASCADE," +
            "plan_id TEXT NOT NULL CHECK (length(plan_id) > 0)," +
            "payload_version INTEGER NOT NULL CHECK (payload_version > 0)," +
            "revision INTEGER NOT NULL CHECK (revision >= 0)," +
            "payload_json TEXT NOT NULL," +
            "updated_at TEXT NOT NULL)"
        );
        database.execSQL(
            "CREATE TABLE sync_state (" +
            "execution_id TEXT PRIMARY KEY REFERENCES snapshots(execution_id) ON DELETE CASCADE," +
            "snapshot_revision INTEGER NOT NULL CHECK (snapshot_revision >= 0)," +
            "status TEXT NOT NULL CHECK (status IN ('pending'))," +
            "revision INTEGER NOT NULL CHECK (revision >= 0)," +
            "updated_at TEXT NOT NULL)"
        );
        database.execSQL(
            "CREATE TABLE offline_files (" +
            "file_id TEXT PRIMARY KEY CHECK (length(file_id) > 0)," +
            "account_id INTEGER NOT NULL DEFAULT 1 REFERENCES account_state(id) ON DELETE CASCADE," +
            "plan_id TEXT NULL," +
            "relative_path TEXT NOT NULL UNIQUE," +
            "content_type TEXT NOT NULL CHECK (length(content_type) > 0)," +
            "status TEXT NOT NULL CHECK (status IN ('temporary', 'ready'))," +
            "revision INTEGER NOT NULL CHECK (revision >= 0)," +
            "size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0)," +
            "updated_at TEXT NOT NULL)"
        );
        database.execSQL(
            "CREATE INDEX snapshots_pending_order ON snapshots(updated_at, execution_id)"
        );
        database.execSQL(
            "CREATE INDEX offline_files_plan ON offline_files(plan_id, status)"
        );
    }
}
