package com.dallfit.app.offline;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

final class OfflineStorageDatabase extends SQLiteOpenHelper {
    static final String DATABASE_NAME = "dall-fit-offline.db";
    static final int SCHEMA_VERSION = 5;

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
        if (oldVersion == 1 && newVersion >= 2) migrateFromOneToTwo(database);
        if (oldVersion <= 2 && newVersion >= 3) migrateFromTwoToThree(database);
        if (oldVersion <= 3 && newVersion >= 4) migrateFromThreeToFour(database);
        if (oldVersion <= 4 && newVersion >= 5) migrateFromFourToFive(database);
        if (newVersion != SCHEMA_VERSION || oldVersion < 1 || oldVersion > 5) throw missingMigration();
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
            "next_queue_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_queue_sequence > 0)," +
            "last_recovery TEXT NULL)"
        );
        database.execSQL(
            "INSERT INTO engine_metadata " +
            "(id, state_revision, reset_generation, next_queue_sequence, last_recovery) " +
            "VALUES (1, 0, 0, 1, NULL)"
        );
        database.execSQL(
            "CREATE TABLE account_state (" +
            "id INTEGER PRIMARY KEY CHECK (id = 1)," +
            "person_id TEXT NOT NULL CHECK (length(person_id) > 0))"
        );
        database.execSQL(
            "CREATE TABLE prepared_plan (" +
            "account_id INTEGER NOT NULL DEFAULT 1 REFERENCES account_state(id) ON DELETE CASCADE," +
            "plan_id TEXT PRIMARY KEY CHECK (length(plan_id) > 0)," +
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
            "producer_version_code INTEGER NOT NULL CHECK (producer_version_code > 0)," +
            "sync_contract_version INTEGER NOT NULL CHECK (sync_contract_version > 0)," +
            "revision INTEGER NOT NULL CHECK (revision >= 0)," +
            "payload_json TEXT NOT NULL," +
            "updated_at TEXT NOT NULL)"
        );
        database.execSQL(
            "CREATE TABLE sync_state (" +
            "execution_id TEXT PRIMARY KEY REFERENCES snapshots(execution_id) ON DELETE CASCADE," +
            "snapshot_revision INTEGER NOT NULL CHECK (snapshot_revision >= 0)," +
            "queue_sequence INTEGER NOT NULL UNIQUE CHECK (queue_sequence > 0)," +
            "status TEXT NOT NULL CHECK (status IN ('pending', 'in_flight', 'retry_wait', 'blocked', 'action_required'))," +
            "attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0)," +
            "next_attempt_at TEXT NULL," +
            "reason TEXT NULL," +
            "action_details_json TEXT NULL," +
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
        createLatestCompletionTable(database);
        database.execSQL(
            "CREATE INDEX snapshots_pending_order ON snapshots(updated_at, execution_id)"
        );
        database.execSQL(
            "CREATE INDEX sync_state_eligible_order ON sync_state(status, next_attempt_at, queue_sequence)"
        );
        database.execSQL(
            "CREATE INDEX offline_files_plan ON offline_files(plan_id, status)"
        );
    }

    private static void migrateFromOneToTwo(SQLiteDatabase database) {
        database.execSQL(
            "ALTER TABLE engine_metadata ADD COLUMN next_queue_sequence INTEGER NOT NULL DEFAULT 1 " +
            "CHECK (next_queue_sequence > 0)"
        );
        database.execSQL("ALTER TABLE sync_state RENAME TO sync_state_v1");
        database.execSQL(
            "CREATE TABLE sync_state (" +
            "execution_id TEXT PRIMARY KEY REFERENCES snapshots(execution_id) ON DELETE CASCADE," +
            "snapshot_revision INTEGER NOT NULL CHECK (snapshot_revision >= 0)," +
            "queue_sequence INTEGER NOT NULL UNIQUE CHECK (queue_sequence > 0)," +
            "status TEXT NOT NULL CHECK (status IN ('pending', 'in_flight', 'retry_wait', 'blocked', 'action_required'))," +
            "attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0)," +
            "next_attempt_at TEXT NULL," +
            "reason TEXT NULL," +
            "action_details_json TEXT NULL," +
            "revision INTEGER NOT NULL CHECK (revision >= 0)," +
            "updated_at TEXT NOT NULL)"
        );
        long sequence = 1;
        try (
            android.database.Cursor cursor = database.rawQuery(
                "SELECT execution_id, snapshot_revision, revision, updated_at " +
                "FROM sync_state_v1 ORDER BY updated_at, execution_id",
                null
            )
        ) {
            while (cursor.moveToNext()) {
                android.content.ContentValues values = new android.content.ContentValues();
                values.put("execution_id", cursor.getString(0));
                values.put("snapshot_revision", cursor.getLong(1));
                values.put("queue_sequence", sequence++);
                values.put("status", "pending");
                values.put("attempt_count", 0);
                values.put("revision", cursor.getLong(2));
                values.put("updated_at", cursor.getString(3));
                database.insertOrThrow("sync_state", null, values);
            }
        }
        android.content.ContentValues metadata = new android.content.ContentValues();
        metadata.put("next_queue_sequence", sequence);
        database.update("engine_metadata", metadata, "id = 1", null);
        database.execSQL("DROP TABLE sync_state_v1");
        database.execSQL(
            "CREATE INDEX sync_state_eligible_order ON sync_state(status, next_attempt_at, queue_sequence)"
        );
    }

    private static void migrateFromTwoToThree(SQLiteDatabase database) {
        createLatestCompletionTable(database);
    }

    private static void migrateFromThreeToFour(SQLiteDatabase database) {
        database.execSQL(
            "ALTER TABLE snapshots ADD COLUMN producer_version_code INTEGER NOT NULL DEFAULT 1 " +
            "CHECK (producer_version_code > 0)"
        );
        database.execSQL(
            "ALTER TABLE snapshots ADD COLUMN sync_contract_version INTEGER NOT NULL DEFAULT 1 " +
            "CHECK (sync_contract_version > 0)"
        );
    }

    private static void migrateFromFourToFive(SQLiteDatabase database) {
        database.execSQL("ALTER TABLE prepared_plan RENAME TO prepared_plan_v4");
        database.execSQL(
            "CREATE TABLE prepared_plan (" +
            "account_id INTEGER NOT NULL DEFAULT 1 REFERENCES account_state(id) ON DELETE CASCADE," +
            "plan_id TEXT PRIMARY KEY CHECK (length(plan_id) > 0)," +
            "payload_version INTEGER NOT NULL CHECK (payload_version > 0)," +
            "revision INTEGER NOT NULL CHECK (revision >= 0)," +
            "payload_json TEXT NOT NULL," +
            "validated_at TEXT NOT NULL," +
            "expires_at TEXT NOT NULL," +
            "updated_at TEXT NOT NULL)"
        );
        database.execSQL(
            "INSERT INTO prepared_plan " +
            "(account_id, plan_id, payload_version, revision, payload_json, validated_at, expires_at, updated_at) " +
            "SELECT account_id, plan_id, payload_version, revision, payload_json, validated_at, expires_at, updated_at " +
            "FROM prepared_plan_v4"
        );
        database.execSQL("DROP TABLE prepared_plan_v4");
    }

    private static void createLatestCompletionTable(SQLiteDatabase database) {
        database.execSQL(
            "CREATE TABLE latest_completion (" +
            "id INTEGER PRIMARY KEY CHECK (id = 1)," +
            "account_id INTEGER NOT NULL DEFAULT 1 REFERENCES account_state(id) ON DELETE CASCADE," +
            "execution_id TEXT NOT NULL CHECK (length(execution_id) > 0)," +
            "queue_sequence INTEGER NOT NULL CHECK (queue_sequence > 0)," +
            "status TEXT NOT NULL CHECK (status IN ('pending', 'canonical'))," +
            "presentation_json TEXT NOT NULL," +
            "updated_at TEXT NOT NULL)"
        );
    }

    private static OfflineStorageException missingMigration() {
        return new OfflineStorageException(
            "OFFLINE_STORAGE_MIGRATION_MISSING",
            "Offline storage migration is unavailable."
        );
    }
}
