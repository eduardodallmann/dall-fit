package com.dallfit.app.offline;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteException;
import android.util.Log;
import java.io.File;
import java.io.IOException;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.locks.ReentrantLock;
import org.json.JSONException;
import org.json.JSONObject;

public final class OfflineStorageService {
    interface SnapshotWriteHook {
        void afterSnapshotWritten(long revision);
    }

    public interface StateListener {
        void onStateChanged(OfflineStorageState state);
    }

    private interface DatabaseWork<T> {
        T run(SQLiteDatabase database);
    }

    private static final String ACCOUNT_DIRECTORY = "account";
    private static final String DISCARD_DIRECTORY = "discard";
    private static final String FILES_DIRECTORY = "files";
    private static final String LOG_TAG = "DallFitOfflineStorage";
    private static final String OFFLINE_DIRECTORY = "offline";
    private static final String RECOVERY_MIGRATION_RESET = "migration-reset";

    private final Context context;
    private final String databaseName;
    private final List<StateListener> listeners = new CopyOnWriteArrayList<>();
    private final ReentrantLock mutationLock = new ReentrantLock(true);
    private final File rootDirectory;
    private final SnapshotWriteHook snapshotWriteHook;
    private boolean blocked;
    private OfflineStorageDatabase helper;
    private boolean initialized;

    public OfflineStorageService(Context context) {
        this(context, OfflineStorageDatabase.DATABASE_NAME, OFFLINE_DIRECTORY, ignored -> {});
    }

    OfflineStorageService(Context context, String databaseName, String directoryName) {
        this(context, databaseName, directoryName, ignored -> {});
    }

    OfflineStorageService(
        Context context,
        String databaseName,
        String directoryName,
        SnapshotWriteHook snapshotWriteHook
    ) {
        this.context = context.getApplicationContext();
        this.databaseName = databaseName;
        this.rootDirectory = new File(this.context.getFilesDir(), directoryName);
        this.helper = new OfflineStorageDatabase(this.context, databaseName);
        this.snapshotWriteHook = snapshotWriteHook;
    }

    public void addStateListener(StateListener listener) {
        listeners.add(listener);
    }

    public void removeStateListener(StateListener listener) {
        listeners.remove(listener);
    }

    public OfflineStorageState initialize() {
        mutationLock.lock();
        try {
            ensureInitializedLocked();
            return readStateLocked();
        } finally {
            mutationLock.unlock();
        }
    }

    public OfflineStorageState getState() {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            return readStateLocked();
        } finally {
            mutationLock.unlock();
        }
    }

    public void bindAccount(String personId) {
        requireText(personId, "personId");
        mutate(database -> {
            try (Cursor cursor = database.rawQuery("SELECT person_id FROM account_state WHERE id = 1", null)) {
                if (cursor.moveToFirst()) {
                    if (!personId.equals(cursor.getString(0))) {
                        throw new OfflineStorageException(
                            "OFFLINE_STORAGE_ACCOUNT_MISMATCH",
                            "Offline storage belongs to another account."
                        );
                    }
                    return false;
                }
            }
            ContentValues values = new ContentValues();
            values.put("id", 1);
            values.put("person_id", personId);
            database.insertOrThrow("account_state", null, values);
            incrementStateRevision(database);
            return true;
        });
    }

    public boolean hasPendingChanges() {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            SQLiteDatabase database = helper.getReadableDatabase();
            return exists(database, "active_session") || count(database, "sync_state", "status = ?", new String[] { "pending" }) > 0;
        } finally {
            mutationLock.unlock();
        }
    }

    public StoredAggregate getPreparedPlan() {
        return readAggregate(
            "SELECT plan_id, plan_id, payload_version, revision, payload_json, updated_at FROM prepared_plan WHERE id = 1"
        );
    }

    public void putPreparedPlan(
        String planId,
        int payloadVersion,
        long revision,
        String payloadJson,
        String validatedAt,
        String expiresAt
    ) {
        putPreparedPlan(planId, payloadVersion, revision, payloadJson, validatedAt, expiresAt, null, null);
    }

    public void putPreparedPlan(
        String planId,
        int payloadVersion,
        long revision,
        String payloadJson,
        String validatedAt,
        String expiresAt,
        String expectedPlanId,
        Long expectedRevision
    ) {
        validateAggregate(planId, null, payloadVersion, revision, payloadJson, validatedAt);
        requireIsoInstant(expiresAt, "expiresAt");
        if ((expectedPlanId == null) != (expectedRevision == null)) throw invalidInput("expectedPlan");
        if (expectedPlanId != null) {
            requireText(expectedPlanId, "expectedPlanId");
            requireRevision(expectedRevision);
        }
        mutate(database -> {
            requireAccount(database);
            boolean replacingCurrentPlan = validatePreparedPlanReplacement(
                database,
                planId,
                expectedPlanId,
                expectedRevision
            );
            if (!replacingCurrentPlan &&
                !mayWriteRevision(
                    database,
                    "prepared_plan",
                    "id = 1",
                    new String[0],
                    revision,
                    payloadJson,
                    planId,
                    payloadVersion,
                    validatedAt,
                    null,
                    null,
                    "expires_at",
                    expiresAt
                )
            ) return false;
            ContentValues values = aggregateValues(planId, payloadVersion, revision, payloadJson, validatedAt);
            values.put("id", 1);
            values.put("account_id", 1);
            values.put("validated_at", validatedAt);
            values.put("expires_at", expiresAt);
            int updated = database.update("prepared_plan", values, "id = 1", null);
            if (updated == 0) database.insertOrThrow("prepared_plan", null, values);
            incrementStateRevision(database);
            return true;
        });
    }

    public boolean removePreparedPlan(String planId, long expectedRevision) {
        requireText(planId, "planId");
        requireRevision(expectedRevision);
        return mutate(database -> {
            int deleted = database.delete(
                "prepared_plan",
                "id = 1 AND plan_id = ? AND revision = ?",
                new String[] { planId, Long.toString(expectedRevision) }
            );
            if (deleted == 0) return false;
            incrementStateRevision(database);
            return true;
        });
    }

    public StoredAggregate getActiveSession() {
        return readAggregate(
            "SELECT session_id, plan_id, payload_version, revision, payload_json, updated_at FROM active_session WHERE id = 1"
        );
    }

    public void putActiveSession(
        String sessionId,
        String planId,
        int payloadVersion,
        long revision,
        String payloadJson,
        String updatedAt
    ) {
        validateAggregate(sessionId, planId, payloadVersion, revision, payloadJson, updatedAt);
        mutate(database -> {
            requireAccount(database);
            if (
                !mayWriteRevision(
                    database,
                    "active_session",
                    "id = 1",
                    new String[0],
                    revision,
                    payloadJson,
                    planId,
                    payloadVersion,
                    updatedAt,
                    "session_id",
                    sessionId,
                    null,
                    null
                )
            ) return false;
            ContentValues values = aggregateValues(planId, payloadVersion, revision, payloadJson, updatedAt);
            values.put("id", 1);
            values.put("account_id", 1);
            values.put("session_id", sessionId);
            database.insertWithOnConflict("active_session", null, values, SQLiteDatabase.CONFLICT_REPLACE);
            incrementStateRevision(database);
            return true;
        });
    }

    public boolean removeActiveSession(String sessionId, long expectedRevision) {
        requireText(sessionId, "sessionId");
        requireRevision(expectedRevision);
        return mutate(database -> {
            int deleted = database.delete(
                "active_session",
                "id = 1 AND session_id = ? AND revision = ?",
                new String[] { sessionId, Long.toString(expectedRevision) }
            );
            if (deleted == 0) return false;
            incrementStateRevision(database);
            return true;
        });
    }

    public StoredAggregate getSnapshot(String executionId) {
        requireText(executionId, "executionId");
        return readAggregate(
            "SELECT execution_id, plan_id, payload_version, revision, payload_json, updated_at " +
            "FROM snapshots WHERE execution_id = ?",
            new String[] { executionId }
        );
    }

    public List<StoredAggregate> listSnapshots() {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            List<StoredAggregate> snapshots = new ArrayList<>();
            try (
                Cursor cursor = helper
                    .getReadableDatabase()
                    .rawQuery(
                        "SELECT execution_id, plan_id, payload_version, revision, payload_json, updated_at " +
                        "FROM snapshots ORDER BY updated_at, execution_id",
                        null
                    )
            ) {
                while (cursor.moveToNext()) snapshots.add(readAggregate(cursor));
            }
            return snapshots;
        } finally {
            mutationLock.unlock();
        }
    }

    public void putSnapshot(
        String executionId,
        String planId,
        int payloadVersion,
        long revision,
        String payloadJson,
        String updatedAt
    ) {
        validateAggregate(executionId, planId, payloadVersion, revision, payloadJson, updatedAt);
        mutate(database -> {
            requireAccount(database);
            if (
                !mayWriteRevision(
                    database,
                    "snapshots",
                    "execution_id = ?",
                    new String[] { executionId },
                    revision,
                    payloadJson,
                    planId,
                    payloadVersion,
                    updatedAt,
                    null,
                    null,
                    null,
                    null
                )
            ) return false;
            ContentValues snapshotValues = aggregateValues(planId, payloadVersion, revision, payloadJson, updatedAt);
            snapshotValues.put("execution_id", executionId);
            snapshotValues.put("account_id", 1);
            int updated = database.update(
                "snapshots",
                snapshotValues,
                "execution_id = ?",
                new String[] { executionId }
            );
            if (updated == 0) database.insertOrThrow("snapshots", null, snapshotValues);
            snapshotWriteHook.afterSnapshotWritten(revision);

            long syncRevision = nextSyncRevision(database, executionId);
            ContentValues syncValues = new ContentValues();
            syncValues.put("execution_id", executionId);
            syncValues.put("snapshot_revision", revision);
            syncValues.put("status", "pending");
            syncValues.put("revision", syncRevision);
            syncValues.put("updated_at", updatedAt);
            database.insertWithOnConflict("sync_state", null, syncValues, SQLiteDatabase.CONFLICT_REPLACE);
            incrementStateRevision(database);
            return true;
        });
    }

    public boolean removeSnapshot(String executionId, long expectedRevision) {
        requireText(executionId, "executionId");
        requireRevision(expectedRevision);
        return mutate(database -> {
            int deleted = database.delete(
                "snapshots",
                "execution_id = ? AND revision = ?",
                new String[] { executionId, Long.toString(expectedRevision) }
            );
            if (deleted == 0) return false;
            incrementStateRevision(database);
            return true;
        });
    }

    public OfflineFileMetadata registerTemporaryFile(
        String fileId,
        String planId,
        String contentType,
        long revision,
        String updatedAt
    ) {
        return registerTemporaryFile(fileId, planId, contentType, revision, updatedAt, null);
    }

    public OfflineFileMetadata registerTemporaryFile(
        String fileId,
        String planId,
        String contentType,
        long revision,
        String updatedAt,
        Long expectedRevision
    ) {
        requireText(fileId, "fileId");
        if (planId != null) requireText(planId, "planId");
        requireText(contentType, "contentType");
        requireRevision(revision);
        if (expectedRevision != null) requireRevision(expectedRevision);
        requireIsoInstant(updatedAt, "updatedAt");
        validateFileId(fileId);

        mutationLock.lock();
        OfflineStorageState state = null;
        try {
            ensureOperationalLocked();
            SQLiteDatabase database = helper.getWritableDatabase();
            requireAccount(database);
            OfflineFileMetadata current = getFileLocked(fileId);
            if (current == null && expectedRevision != null) throw revisionConflict();
            if (current != null && (expectedRevision == null || current.getRevision() != expectedRevision)) {
                throw revisionConflict();
            }
            if (current != null && revision <= current.getRevision()) throw revisionConflict();
            File temporaryFile = temporaryFile(fileId);
            ensureDirectory(temporaryFile.getParentFile());
            File discarded = null;
            if (current != null) {
                File currentFile = "ready".equals(current.getStatus()) ? readyFile(fileId) : temporaryFile(fileId);
                if (currentFile.exists()) {
                    ensureDirectory(discardDirectory());
                    discarded = new File(discardDirectory(), UUID.randomUUID().toString());
                    if (!currentFile.renameTo(discarded)) throw new OfflineStorageException(
                        "OFFLINE_FILE_COMMIT_FAILED",
                        "Offline file could not be isolated."
                    );
                }
            }
            try {
                if (temporaryFile.exists() || !temporaryFile.createNewFile()) {
                    throw new IOException("Unable to create temporary offline file.");
                }
            } catch (IOException error) {
                if (discarded != null && !restoreFile(discarded, current, fileId)) blocked = true;
                throw error;
            }
            try {
                runTransaction(database, transaction -> {
                    ContentValues values = new ContentValues();
                    values.put("file_id", fileId);
                    values.put("account_id", 1);
                    values.put("plan_id", planId);
                    values.put("relative_path", relativePath(temporaryFile));
                    values.put("content_type", contentType);
                    values.put("status", "temporary");
                    values.put("revision", revision);
                    values.put("size_bytes", temporaryFile.length());
                    values.put("updated_at", updatedAt);
                    if (current == null) {
                        transaction.insertOrThrow("offline_files", null, values);
                    } else {
                        int updated = transaction.update(
                            "offline_files",
                            values,
                            "file_id = ? AND revision = ?",
                            new String[] { fileId, Long.toString(expectedRevision) }
                        );
                        if (updated != 1) throw revisionConflict();
                    }
                    incrementStateRevision(transaction);
                    return null;
                });
            } catch (RuntimeException error) {
                if (!deleteIfPresent(temporaryFile)) blocked = true;
                if (discarded != null && !restoreFile(discarded, current, fileId)) blocked = true;
                throw error;
            }
            if (discarded != null && !deleteRecursively(discarded)) {
                blocked = true;
                throw new OfflineStorageException(
                    "OFFLINE_FILE_DELETE_FAILED",
                    "Previous offline file could not be removed."
                );
            }
            state = readStateLocked();
            return getFileLocked(fileId);
        } catch (IOException | SQLiteException error) {
            throw storageFailure(error);
        } finally {
            mutationLock.unlock();
            if (state != null) notifyStateChanged(state);
        }
    }

    public File getTemporaryFileForNativeWrite(String fileId) {
        requireText(fileId, "fileId");
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            OfflineFileMetadata metadata = getFileLocked(fileId);
            if (metadata == null || !"temporary".equals(metadata.getStatus())) {
                throw new OfflineStorageException("OFFLINE_FILE_NOT_TEMPORARY", "Offline file is not temporary.");
            }
            return temporaryFile(fileId);
        } finally {
            mutationLock.unlock();
        }
    }

    public OfflineFileMetadata completeFile(String fileId, long expectedRevision, String updatedAt) {
        requireText(fileId, "fileId");
        requireRevision(expectedRevision);
        requireIsoInstant(updatedAt, "updatedAt");
        mutationLock.lock();
        OfflineStorageState state = null;
        try {
            ensureOperationalLocked();
            OfflineFileMetadata metadata = getFileLocked(fileId);
            if (metadata == null || !"temporary".equals(metadata.getStatus()) || metadata.getRevision() != expectedRevision) {
                throw new OfflineStorageException("OFFLINE_FILE_REVISION_CONFLICT", "Offline file revision does not match.");
            }
            File source = temporaryFile(fileId);
            File target = readyFile(fileId);
            if (target.exists() || !source.isFile() || !source.renameTo(target)) {
                throw new OfflineStorageException("OFFLINE_FILE_COMMIT_FAILED", "Offline file could not be completed.");
            }
            try {
                SQLiteDatabase database = helper.getWritableDatabase();
                runTransaction(database, transaction -> {
                    ContentValues values = new ContentValues();
                    values.put("relative_path", relativePath(target));
                    values.put("status", "ready");
                    values.put("size_bytes", target.length());
                    values.put("updated_at", updatedAt);
                    int updated = transaction.update(
                        "offline_files",
                        values,
                        "file_id = ? AND revision = ? AND status = 'temporary'",
                        new String[] { fileId, Long.toString(expectedRevision) }
                    );
                    if (updated != 1) throw new OfflineStorageException(
                        "OFFLINE_FILE_REVISION_CONFLICT",
                        "Offline file revision does not match."
                    );
                    incrementStateRevision(transaction);
                    return null;
                });
            } catch (RuntimeException error) {
                if (!target.renameTo(source)) blocked = true;
                throw error;
            }
            state = readStateLocked();
            return getFileLocked(fileId);
        } finally {
            mutationLock.unlock();
            if (state != null) notifyStateChanged(state);
        }
    }

    public OfflineFileMetadata getFile(String fileId) {
        requireText(fileId, "fileId");
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            return getFileLocked(fileId);
        } finally {
            mutationLock.unlock();
        }
    }

    public boolean removeFile(String fileId, long expectedRevision) {
        requireText(fileId, "fileId");
        requireRevision(expectedRevision);
        mutationLock.lock();
        OfflineStorageState state = null;
        try {
            ensureOperationalLocked();
            OfflineFileMetadata metadata = getFileLocked(fileId);
            if (metadata == null || metadata.getRevision() != expectedRevision) return false;
            File file = "ready".equals(metadata.getStatus()) ? readyFile(fileId) : temporaryFile(fileId);
            File discarded = null;
            if (file.exists()) {
                ensureDirectory(discardDirectory());
                discarded = new File(discardDirectory(), UUID.randomUUID().toString());
                if (!file.renameTo(discarded)) throw new OfflineStorageException(
                    "OFFLINE_FILE_DELETE_FAILED",
                    "Offline file could not be isolated."
                );
            }
            SQLiteDatabase database = helper.getWritableDatabase();
            try {
                runTransaction(database, transaction -> {
                    int deleted = transaction.delete(
                        "offline_files",
                        "file_id = ? AND revision = ?",
                        new String[] { fileId, Long.toString(expectedRevision) }
                    );
                    if (deleted != 1) throw new OfflineStorageException(
                        "OFFLINE_FILE_REVISION_CONFLICT",
                        "Offline file revision does not match."
                    );
                    incrementStateRevision(transaction);
                    return null;
                });
            } catch (RuntimeException error) {
                if (discarded != null && !discarded.renameTo(file)) blocked = true;
                throw error;
            }
            if (discarded != null && !deleteRecursively(discarded)) {
                blocked = true;
                throw new OfflineStorageException(
                    "OFFLINE_FILE_DELETE_FAILED",
                    "Offline file could not be removed."
                );
            }
            state = readStateLocked();
            return true;
        } finally {
            mutationLock.unlock();
            if (state != null) notifyStateChanged(state);
        }
    }

    public void clearAccountDataAtomically() {
        mutationLock.lock();
        OfflineStorageState state = null;
        try {
            ensureInitializedLocked();
            if (!deleteChildren(discardDirectory())) {
                blocked = true;
                throw new OfflineStorageException(
                    "OFFLINE_STORAGE_CLEAR_FAILED",
                    "Offline account data could not be removed."
                );
            }
            File accountDirectory = accountDirectory();
            File discarded = null;
            if (accountDirectory.exists()) {
                ensureDirectory(discardDirectory());
                discarded = new File(discardDirectory(), UUID.randomUUID().toString());
                if (!accountDirectory.renameTo(discarded)) {
                    blocked = true;
                    throw new OfflineStorageException(
                        "OFFLINE_STORAGE_CLEAR_FAILED",
                        "Offline account data could not be isolated."
                    );
                }
            }
            try {
                SQLiteDatabase database = helper.getWritableDatabase();
                runTransaction(database, transaction -> {
                    int deleted = transaction.delete("account_state", "id = 1", null);
                    if (deleted > 0) incrementStateRevision(transaction);
                    return null;
                });
            } catch (RuntimeException error) {
                blocked = true;
                if (discarded != null) discarded.renameTo(accountDirectory);
                throw error;
            }
            if (discarded != null && !deleteRecursively(discarded)) {
                blocked = true;
                throw new OfflineStorageException("OFFLINE_STORAGE_CLEAR_FAILED", "Offline account data could not be removed.");
            }
            blocked = false;
            state = readStateLocked();
        } finally {
            mutationLock.unlock();
            if (state != null) notifyStateChanged(state);
        }
    }

    public void close() {
        mutationLock.lock();
        try {
            helper.close();
            initialized = false;
        } finally {
            mutationLock.unlock();
        }
    }

    private boolean mutate(DatabaseWork<Boolean> work) {
        mutationLock.lock();
        OfflineStorageState state = null;
        try {
            ensureOperationalLocked();
            SQLiteDatabase database = helper.getWritableDatabase();
            boolean changed = runTransaction(database, work);
            if (changed) state = readStateLocked();
            return changed;
        } finally {
            mutationLock.unlock();
            if (state != null) notifyStateChanged(state);
        }
    }

    private <T> T runTransaction(SQLiteDatabase database, DatabaseWork<T> work) {
        database.beginTransaction();
        try {
            T result = work.run(database);
            database.setTransactionSuccessful();
            return result;
        } finally {
            database.endTransaction();
        }
    }

    private void ensureInitializedLocked() {
        if (initialized) return;
        ensureDirectory(rootDirectory);
        ensureDirectory(discardDirectory());
        if (!deleteChildren(discardDirectory())) {
            blocked = true;
            throw new OfflineStorageException("OFFLINE_STORAGE_INITIALIZATION_FAILED", "Offline storage could not be initialized.");
        }
        openWithRecoveryLocked();
        cleanupTemporaryFilesLocked();
        blocked = false;
        initialized = true;
    }

    private void ensureOperationalLocked() {
        ensureInitializedLocked();
        if (blocked) throw new OfflineStorageException("OFFLINE_STORAGE_BLOCKED", "Offline storage is unavailable until cleanup succeeds.");
    }

    private void openWithRecoveryLocked() {
        try {
            helper.getWritableDatabase();
            return;
        } catch (RuntimeException error) {
            helper.close();
            helper = new OfflineStorageDatabase(context, databaseName);
        }
        try {
            helper.getWritableDatabase();
            return;
        } catch (RuntimeException secondFailure) {
            helper.close();
            long previousGeneration = readResetGenerationBestEffort();
            Log.e(
                LOG_TAG,
                "category=" + RECOVERY_MIGRATION_RESET +
                " fromVersion=unknown toVersion=" + OfflineStorageDatabase.SCHEMA_VERSION +
                " exception=" + secondFailure.getClass().getSimpleName()
            );
            resetStorageFilesLocked();
            helper = new OfflineStorageDatabase(context, databaseName);
            try {
                SQLiteDatabase database = helper.getWritableDatabase();
                ContentValues values = new ContentValues();
                values.put("reset_generation", previousGeneration + 1);
                values.put("last_recovery", RECOVERY_MIGRATION_RESET);
                database.update("engine_metadata", values, "id = 1", null);
            } catch (RuntimeException resetFailure) {
                blocked = true;
                throw new OfflineStorageException(
                    "OFFLINE_STORAGE_INITIALIZATION_FAILED",
                    "Offline storage could not be initialized.",
                    resetFailure
                );
            }
        }
    }

    private long readResetGenerationBestEffort() {
        try {
            SQLiteDatabase database = SQLiteDatabase.openDatabase(
                context.getDatabasePath(databaseName).getPath(),
                null,
                SQLiteDatabase.OPEN_READONLY
            );
            try (database; Cursor cursor = database.rawQuery("SELECT reset_generation FROM engine_metadata WHERE id = 1", null)) {
                return cursor.moveToFirst() ? cursor.getLong(0) : 0;
            }
        } catch (RuntimeException ignored) {
            return 0;
        }
    }

    private void resetStorageFilesLocked() {
        helper.close();
        boolean databaseDeleted = context.deleteDatabase(databaseName);
        File databaseFile = context.getDatabasePath(databaseName);
        boolean sidecarsDeleted = deleteIfPresent(new File(databaseFile.getPath() + "-wal")) &&
            deleteIfPresent(new File(databaseFile.getPath() + "-shm")) &&
            deleteIfPresent(new File(databaseFile.getPath() + "-journal"));
        boolean filesDeleted = deleteChildren(rootDirectory);
        if ((!databaseDeleted && databaseFile.exists()) || !sidecarsDeleted || !filesDeleted) {
            throw new OfflineStorageException("OFFLINE_STORAGE_RESET_FAILED", "Offline storage could not be reset.");
        }
    }

    private void cleanupTemporaryFilesLocked() {
        SQLiteDatabase database = helper.getWritableDatabase();
        File directory = filesDirectory();
        File[] files = directory.listFiles((ignored, name) -> name.endsWith(".part"));
        if (directory.exists() && files == null) {
            blocked = true;
            throw new OfflineStorageException(
                "OFFLINE_STORAGE_INITIALIZATION_FAILED",
                "Offline storage could not be initialized."
            );
        }
        if (files != null) {
            for (File file : files) {
                if (!deleteIfPresent(file)) {
                    blocked = true;
                    throw new OfflineStorageException(
                        "OFFLINE_STORAGE_INITIALIZATION_FAILED",
                        "Offline storage could not be initialized."
                    );
                }
            }
        }
        int temporaryCount = count(database, "offline_files", "status = ?", new String[] { "temporary" });
        if (temporaryCount == 0) return;
        runTransaction(database, transaction -> {
            int deleted = transaction.delete("offline_files", "status = 'temporary'", null);
            if (deleted != temporaryCount) {
                blocked = true;
                throw new OfflineStorageException(
                    "OFFLINE_STORAGE_INITIALIZATION_FAILED",
                    "Offline storage could not be initialized."
                );
            }
            incrementStateRevision(transaction);
            return null;
        });
    }

    private StoredAggregate readAggregate(String sql) {
        return readAggregate(sql, null);
    }

    private StoredAggregate readAggregate(String sql, String[] arguments) {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            try (Cursor cursor = helper.getReadableDatabase().rawQuery(sql, arguments)) {
                return cursor.moveToFirst() ? readAggregate(cursor) : null;
            }
        } finally {
            mutationLock.unlock();
        }
    }

    private StoredAggregate readAggregate(Cursor cursor) {
        return new StoredAggregate(
            cursor.getString(0),
            cursor.getString(1),
            cursor.getInt(2),
            cursor.getLong(3),
            cursor.getString(4),
            cursor.getString(5)
        );
    }

    private OfflineFileMetadata getFileLocked(String fileId) {
        try (
            Cursor cursor = helper
                .getReadableDatabase()
                .rawQuery(
                    "SELECT file_id, plan_id, content_type, revision, size_bytes, status, updated_at " +
                    "FROM offline_files WHERE file_id = ?",
                    new String[] { fileId }
                )
        ) {
            if (!cursor.moveToFirst()) return null;
            return new OfflineFileMetadata(
                cursor.getString(0),
                cursor.isNull(1) ? null : cursor.getString(1),
                cursor.getString(2),
                cursor.getLong(3),
                cursor.getLong(4),
                cursor.getString(5),
                cursor.getString(6)
            );
        }
    }

    private OfflineStorageState readStateLocked() {
        SQLiteDatabase database = helper.getReadableDatabase();
        try (
            Cursor cursor = database.rawQuery(
                "SELECT state_revision, reset_generation, last_recovery FROM engine_metadata WHERE id = 1",
                null
            )
        ) {
            if (!cursor.moveToFirst()) throw new OfflineStorageException(
                "OFFLINE_STORAGE_STATE_INVALID",
                "Offline storage state is unavailable."
            );
            return new OfflineStorageState(
                cursor.getLong(0),
                cursor.getLong(1),
                cursor.isNull(2) ? "none" : cursor.getString(2),
                exists(database, "account_state"),
                exists(database, "prepared_plan"),
                exists(database, "active_session"),
                count(database, "sync_state", "status = ?", new String[] { "pending" }),
                count(database, "offline_files", "status = ?", new String[] { "temporary" }),
                count(database, "offline_files", "status = ?", new String[] { "ready" })
            );
        }
    }

    private void notifyStateChanged(OfflineStorageState state) {
        for (StateListener listener : listeners) {
            try {
                listener.onStateChanged(state);
            } catch (RuntimeException error) {
                Log.e(
                    LOG_TAG,
                    "category=listener-failed exception=" + error.getClass().getSimpleName()
                );
            }
        }
    }

    private boolean mayWriteRevision(
        SQLiteDatabase database,
        String table,
        String where,
        String[] arguments,
        long revision,
        String payloadJson,
        String planId,
        int payloadVersion,
        String updatedAt,
        String identityColumn,
        String identityValue,
        String extraColumn,
        String extraValue
    ) {
        List<String> columns = new ArrayList<>();
        columns.add("revision");
        columns.add("payload_json");
        columns.add("plan_id");
        columns.add("payload_version");
        columns.add("updated_at");
        if (identityColumn != null) columns.add(identityColumn);
        if (extraColumn != null) columns.add(extraColumn);
        try (
            Cursor cursor = database.query(
                table,
                columns.toArray(new String[0]),
                where,
                arguments,
                null,
                null,
                null
            )
        ) {
            if (!cursor.moveToFirst()) return true;
            long currentRevision = cursor.getLong(0);
            if (revision < currentRevision) throw new OfflineStorageException(
                "OFFLINE_STORAGE_REVISION_CONFLICT",
                "Offline storage revision is older than the current value."
            );
            if (revision == currentRevision) {
                boolean sameEnvelope = payloadJson.equals(cursor.getString(1)) &&
                    planId.equals(cursor.getString(2)) &&
                    payloadVersion == cursor.getInt(3) &&
                    updatedAt.equals(cursor.getString(4));
                int nextColumn = 5;
                if (identityColumn != null) {
                    sameEnvelope = sameEnvelope && identityValue.equals(cursor.getString(nextColumn++));
                }
                if (extraColumn != null) {
                    sameEnvelope = sameEnvelope && extraValue.equals(cursor.getString(nextColumn));
                }
                if (!sameEnvelope) throw new OfflineStorageException(
                        "OFFLINE_STORAGE_REVISION_CONFLICT",
                        "Offline storage revision already has different content."
                    );
                return false;
            }
            return true;
        }
    }

    private boolean validatePreparedPlanReplacement(
        SQLiteDatabase database,
        String planId,
        String expectedPlanId,
        Long expectedRevision
    ) {
        try (Cursor cursor = database.rawQuery("SELECT plan_id, revision FROM prepared_plan WHERE id = 1", null)) {
            if (!cursor.moveToFirst()) {
                if (expectedPlanId != null) throw revisionConflict();
                return false;
            }
            String currentPlanId = cursor.getString(0);
            if (planId.equals(currentPlanId)) return false;
            if (
                expectedPlanId == null ||
                !expectedPlanId.equals(currentPlanId) ||
                expectedRevision.longValue() != cursor.getLong(1)
            ) throw revisionConflict();
            return true;
        }
    }

    private static OfflineStorageException revisionConflict() {
        return new OfflineStorageException(
            "OFFLINE_STORAGE_REVISION_CONFLICT",
            "Offline storage revision does not match."
        );
    }

    private long nextSyncRevision(SQLiteDatabase database, String executionId) {
        try (
            Cursor cursor = database.rawQuery(
                "SELECT revision FROM sync_state WHERE execution_id = ?",
                new String[] { executionId }
            )
        ) {
            return cursor.moveToFirst() ? cursor.getLong(0) + 1 : 0;
        }
    }

    private static ContentValues aggregateValues(
        String planId,
        int payloadVersion,
        long revision,
        String payloadJson,
        String updatedAt
    ) {
        ContentValues values = new ContentValues();
        values.put("plan_id", planId);
        values.put("payload_version", payloadVersion);
        values.put("revision", revision);
        values.put("payload_json", payloadJson);
        values.put("updated_at", updatedAt);
        return values;
    }

    private static void validateAggregate(
        String id,
        String planId,
        int payloadVersion,
        long revision,
        String payloadJson,
        String updatedAt
    ) {
        requireText(id, "id");
        if (planId != null) requireText(planId, "planId");
        if (payloadVersion <= 0) throw invalidInput("payloadVersion");
        requireRevision(revision);
        requireIsoInstant(updatedAt, "updatedAt");
        try {
            new JSONObject(payloadJson);
        } catch (JSONException | NullPointerException error) {
            throw invalidInput("payload");
        }
    }

    private static void requireAccount(SQLiteDatabase database) {
        if (!exists(database, "account_state")) throw new OfflineStorageException(
            "OFFLINE_STORAGE_ACCOUNT_REQUIRED",
            "Offline storage account is required."
        );
    }

    private static void requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) throw invalidInput(field);
    }

    private static void requireRevision(long revision) {
        if (revision < 0) throw invalidInput("revision");
    }

    private static void requireIsoInstant(String value, String field) {
        try {
            Instant.parse(value);
        } catch (DateTimeParseException | NullPointerException error) {
            throw invalidInput(field);
        }
    }

    private static void validateFileId(String fileId) {
        if (!fileId.matches("[A-Za-z0-9_-]{1,120}")) throw invalidInput("fileId");
    }

    private static OfflineStorageException invalidInput(String field) {
        return new OfflineStorageException("OFFLINE_STORAGE_INVALID_INPUT", "Invalid offline storage field: " + field + ".");
    }

    private static OfflineStorageException storageFailure(Exception error) {
        return new OfflineStorageException("OFFLINE_STORAGE_WRITE_FAILED", "Offline storage write failed.", error);
    }

    private static void incrementStateRevision(SQLiteDatabase database) {
        database.execSQL("UPDATE engine_metadata SET state_revision = state_revision + 1 WHERE id = 1");
    }

    private static boolean exists(SQLiteDatabase database, String table) {
        return count(database, table, null, null) > 0;
    }

    private static int count(SQLiteDatabase database, String table, String selection, String[] selectionArguments) {
        try (Cursor cursor = database.query(table, new String[] { "COUNT(*)" }, selection, selectionArguments, null, null, null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private File accountDirectory() {
        return new File(rootDirectory, ACCOUNT_DIRECTORY);
    }

    private File filesDirectory() {
        return new File(accountDirectory(), FILES_DIRECTORY);
    }

    private File discardDirectory() {
        return new File(rootDirectory, DISCARD_DIRECTORY);
    }

    private File temporaryFile(String fileId) {
        return safeFile(filesDirectory(), fileId + ".part");
    }

    private File readyFile(String fileId) {
        return safeFile(filesDirectory(), fileId + ".data");
    }

    private boolean restoreFile(File discarded, OfflineFileMetadata metadata, String fileId) {
        File destination = "ready".equals(metadata.getStatus()) ? readyFile(fileId) : temporaryFile(fileId);
        return discarded.renameTo(destination);
    }

    private File safeFile(File parent, String name) {
        try {
            File file = new File(parent, name);
            String rootPath = rootDirectory.getCanonicalPath() + File.separator;
            String parentPath = parent.getCanonicalPath() + File.separator;
            String filePath = file.getCanonicalPath();
            if (!parentPath.startsWith(rootPath) || !filePath.startsWith(parentPath)) throw invalidInput("fileId");
            return file;
        } catch (IOException error) {
            throw storageFailure(error);
        }
    }

    private String relativePath(File file) {
        try {
            String rootPath = rootDirectory.getCanonicalPath() + File.separator;
            String path = file.getCanonicalPath();
            if (!path.startsWith(rootPath)) throw invalidInput("fileId");
            return path.substring(rootPath.length());
        } catch (IOException error) {
            throw storageFailure(error);
        }
    }

    private static void ensureDirectory(File directory) {
        if (directory == null || (directory.exists() && !directory.isDirectory()) || (!directory.exists() && !directory.mkdirs())) {
            throw new OfflineStorageException("OFFLINE_STORAGE_DIRECTORY_FAILED", "Offline storage directory is unavailable.");
        }
    }

    private static boolean deleteIfPresent(File file) {
        return !file.exists() || file.delete();
    }

    private static boolean deleteChildren(File directory) {
        if (!directory.exists()) return true;
        File[] children = directory.listFiles();
        if (children == null) return false;
        boolean deleted = true;
        for (File child : children) deleted = deleteRecursively(child) && deleted;
        return deleted;
    }

    private static boolean deleteRecursively(File file) {
        if (file.isDirectory() && !deleteChildren(file)) return false;
        return deleteIfPresent(file);
    }
}
