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

    public interface SnapshotListener {
        void onSnapshotPending();
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
    private static final String RECOVERY_PREFERENCES = "offline-storage-recovery";
    private static final String RECOVERY_KEY = "pending-recovery";

    private final Context context;
    private final String databaseName;
    private final List<StateListener> listeners = new CopyOnWriteArrayList<>();
    private final List<SnapshotListener> snapshotListeners = new CopyOnWriteArrayList<>();
    private final ReentrantLock mutationLock = new ReentrantLock(true);
    private final File rootDirectory;
    private final SnapshotWriteHook snapshotWriteHook;
    private boolean blocked;
    private OfflineStorageDatabase helper;
    private boolean initialized;

    public OfflineStorageService(Context context) {
        this(context, OfflineStorageDatabase.DATABASE_NAME, OFFLINE_DIRECTORY, ignored -> {});
    }

    Context getContext() {
        return context;
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

    public void addSnapshotListener(SnapshotListener listener) {
        snapshotListeners.add(listener);
    }

    public void removeSnapshotListener(SnapshotListener listener) {
        snapshotListeners.remove(listener);
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

    public void acknowledgeRecovery() {
        mutationLock.lock();
        OfflineStorageState state;
        try {
            ensureOperationalLocked();
            if (!context.getSharedPreferences(RECOVERY_PREFERENCES, Context.MODE_PRIVATE)
                .edit()
                .remove(RECOVERY_KEY)
                .commit()) {
                throw new OfflineStorageException(
                    "OFFLINE_STORAGE_RECOVERY_ACKNOWLEDGEMENT_FAILED",
                    "Offline storage recovery could not be acknowledged."
                );
            }
            state = readStateLocked();
        } finally {
            mutationLock.unlock();
        }
        notifyStateChanged(state);
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

    public String getTermsAccessJson() { return getTermsAccessJson(null); }

    public String getTermsAccessJson(String expectedPersonId) {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            requireTermsAccount(helper.getReadableDatabase(), expectedPersonId);
            try (Cursor cursor = helper.getReadableDatabase().rawQuery(
                "SELECT access_json, required_reference_json, blocked FROM terms_access WHERE account_id = 1", null
            )) {
                if (!cursor.moveToFirst()) return null;
                if (cursor.getInt(2) != 0 && !cursor.isNull(1)) {
                    JSONObject result = new JSONObject();
                    result.put("state", "required");
                    result.put("current", new JSONObject(cursor.getString(1)));
                    result.put("acceptance", JSONObject.NULL);
                    return result.toString();
                }
                return cursor.isNull(0) ? null : cursor.getString(0);
            } catch (JSONException error) {
                throw invalidInput("termsAccess");
            }
        } finally {
            mutationLock.unlock();
        }
    }

    public boolean hasKnownTermsRequirement() {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            try (Cursor cursor = helper.getReadableDatabase().rawQuery(
                "SELECT blocked FROM terms_access WHERE account_id = 1", null
            )) {
                return cursor.moveToFirst() && cursor.getInt(0) != 0;
            }
        } finally {
            mutationLock.unlock();
        }
    }

    public void requireTermsAccepted() {
        String json = getTermsAccessJson();
        try {
            if (json == null || !"accepted".equals(new JSONObject(json).optString("state"))) {
                throw new OfflineStorageException("TERMS_ACCEPTANCE_REQUIRED", "Connect to review the current terms.");
            }
        } catch (JSONException error) {
            throw invalidInput("termsAccess");
        }
    }

    public void recordTermsAccess(String expectedPersonId, String accessJson) {
        final JSONObject access;
        final JSONObject reference;
        try {
            access = TermsAccessValidator.access(accessJson);
            reference = access.optJSONObject("current");
        } catch (JSONException error) {
            throw invalidInput("termsAccess");
        }
        mutate(database -> {
            requireTermsAccount(database, expectedPersonId);
            long minimum = readTermsMinimum(database);
            long number = reference == null ? 0 : reference.optLong("publicationNumber", 0);
            if (number < minimum) return false;
            ContentValues values = new ContentValues();
            values.put("account_id", 1);
            values.put("access_json", access.toString());
            values.put("required_number", number);
            values.put("required_reference_json", reference == null ? null : reference.toString());
            values.put("blocked", "required".equals(access.optString("state")) ? 1 : 0);
            database.insertWithOnConflict("terms_access", null, values, SQLiteDatabase.CONFLICT_REPLACE);
            incrementStateRevision(database);
            return true;
        });
    }

    public void noteTermsRequired(String referenceJson, String expectedPersonId) {
        final JSONObject reference;
        try {
            reference = TermsAccessValidator.reference(new JSONObject(referenceJson));
        } catch (JSONException error) {
            throw invalidInput("termsReference");
        }
        mutate(database -> {
            requireTermsAccount(database, expectedPersonId);
            if (!writeTermsRequirement(database, reference)) return false;
            incrementStateRevision(database);
            return true;
        });
    }

    public boolean pauseSyncForTerms(OfflineSyncClaim claim, String referenceJson, String updatedAt) {
        requireIsoInstant(updatedAt, "updatedAt");
        final JSONObject reference;
        try {
            reference = TermsAccessValidator.reference(new JSONObject(referenceJson));
        } catch (JSONException error) {
            throw invalidInput("termsReference");
        }
        return mutate(database -> {
            String condition = "execution_id = ? AND snapshot_revision = ? AND queue_sequence = ? AND status = 'in_flight'";
            String[] arguments = { claim.getExecutionId(), Long.toString(claim.getRevision()), Long.toString(claim.getQueueSequence()) };
            try (Cursor cursor = database.query("sync_state", new String[] { "execution_id" }, condition, arguments, null, null, null)) {
                if (!cursor.moveToFirst()) return false;
            }
            writeTermsRequirement(database, reference);
            ContentValues pending = new ContentValues();
            pending.put("status", "pending");
            pending.put("attempt_count", 0);
            pending.putNull("next_attempt_at");
            pending.put("reason", "terms-required");
            pending.putNull("action_details_json");
            pending.put("updated_at", updatedAt);
            database.update("sync_state", pending, condition, arguments);
            database.execSQL("UPDATE sync_state SET revision = revision + 1 WHERE execution_id = ?", new Object[] { claim.getExecutionId() });
            incrementStateRevision(database);
            return true;
        });
    }

    private static boolean writeTermsRequirement(SQLiteDatabase database, JSONObject reference) {
        long number = reference.optLong("publicationNumber", 0);
        if (number < readTermsMinimum(database)) return false;
        database.execSQL("INSERT OR IGNORE INTO terms_access (account_id) VALUES (1)");
        ContentValues values = new ContentValues();
        values.put("required_number", number);
        values.put("required_reference_json", reference.toString());
        values.put("blocked", 1);
        database.update("terms_access", values, "account_id = 1", null);
        return true;
    }

    private static void requireTermsAccount(SQLiteDatabase database, String expectedPersonId) {
        requireAccount(database);
        if (expectedPersonId == null) return;
        try (Cursor cursor = database.rawQuery("SELECT person_id FROM account_state WHERE id = 1", null)) {
            if (!cursor.moveToFirst() || !expectedPersonId.equals(cursor.getString(0))) {
                throw new OfflineStorageException("OFFLINE_STORAGE_ACCOUNT_MISMATCH", "Terms belong to another account.");
            }
        }
    }

    private static long readTermsMinimum(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery("SELECT required_number FROM terms_access WHERE account_id = 1", null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0;
        }
    }

    public boolean hasPendingChanges() {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            SQLiteDatabase database = helper.getReadableDatabase();
            return exists(database, "active_session") || count(database, "sync_state", null, null) > 0;
        } finally {
            mutationLock.unlock();
        }
    }

    public StoredAggregate getPreparedPlan(String planId) {
        requireText(planId, "planId");
        return readAggregate(
            "SELECT plan_id, plan_id, payload_version, revision, payload_json, updated_at, validated_at, expires_at " +
            "FROM prepared_plan WHERE plan_id = ?",
            new String[] { planId }
        );
    }

    public List<StoredAggregate> listPreparedPlans() {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            List<StoredAggregate> plans = new ArrayList<>();
            try (Cursor cursor = helper.getReadableDatabase().rawQuery(
                "SELECT plan_id, plan_id, payload_version, revision, payload_json, updated_at, validated_at, expires_at " +
                "FROM prepared_plan ORDER BY plan_id",
                null
            )) {
                while (cursor.moveToNext()) plans.add(readAggregate(cursor));
            }
            return plans;
        } finally {
            mutationLock.unlock();
        }
    }

    public OfflineFileMetadata registerTemporaryFileForPreparedPlan(
        String fileId,
        String planId,
        String contentType,
        long revision,
        String updatedAt,
        long expectedPlanRevision
    ) {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            if (!preparedPlanMatchesLocked(planId, expectedPlanRevision)) throw revisionConflict();
            return registerTemporaryFile(fileId, planId, contentType, revision, updatedAt, null);
        } finally {
            mutationLock.unlock();
        }
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
            validatePreparedPlanExpectation(database, planId, expectedPlanId, expectedRevision);
            if (!mayWriteRevision(
                    database,
                    "prepared_plan",
                    "plan_id = ?",
                    new String[] { planId },
                    revision,
                    payloadJson,
                    planId,
                    payloadVersion,
                    validatedAt,
                    null,
                    null,
                    "expires_at",
                    expiresAt
                )) return false;
            ContentValues values = aggregateValues(planId, payloadVersion, revision, payloadJson, validatedAt);
            values.put("account_id", 1);
            values.put("validated_at", validatedAt);
            values.put("expires_at", expiresAt);
            int updated = database.update("prepared_plan", values, "plan_id = ?", new String[] { planId });
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
                "plan_id = ? AND revision = ?",
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

    public void commitTrainingSession(
        String sessionId,
        String executionId,
        String planId,
        long revision,
        String sessionPayloadJson,
        String snapshotPayloadJson,
        String updatedAt
    ) {
        Log.i(LOG_TAG, "OfflineStorageService -> commitTrainingSession -> params: revision=" + revision);
        validateAggregate(sessionId, planId, 1, revision, sessionPayloadJson, updatedAt);
        validateAggregate(executionId, planId, 1, revision, snapshotPayloadJson, updatedAt);
        boolean changed = mutate(database -> {
            requireAccount(database);
            if (!mayWriteRevision(
                database,
                "active_session",
                "id = 1",
                new String[0],
                revision,
                sessionPayloadJson,
                planId,
                1,
                updatedAt,
                "session_id",
                sessionId,
                null,
                null
            )) throw revisionConflict();
            ContentValues sessionValues = aggregateValues(planId, 1, revision, sessionPayloadJson, updatedAt);
            sessionValues.put("id", 1);
            sessionValues.put("account_id", 1);
            sessionValues.put("session_id", sessionId);
            database.insertWithOnConflict("active_session", null, sessionValues, SQLiteDatabase.CONFLICT_REPLACE);
            writeSnapshotLocked(database, executionId, planId, revision, snapshotPayloadJson, updatedAt);
            incrementStateRevision(database);
            return true;
        });
        if (changed) notifySnapshotPending();
        Log.i(LOG_TAG, "OfflineStorageService -> commitTrainingSession -> return: committed=" + changed);
    }

    public void commitTrainingTerminal(
        String sessionId,
        long expectedSessionRevision,
        String executionId,
        String planId,
        long revision,
        String snapshotPayloadJson,
        String updatedAt
    ) {
        commitTrainingTerminal(
            sessionId,
            expectedSessionRevision,
            executionId,
            planId,
            revision,
            snapshotPayloadJson,
            null,
            updatedAt
        );
    }

    public void commitTrainingTerminal(
        String sessionId,
        long expectedSessionRevision,
        String executionId,
        String planId,
        long revision,
        String snapshotPayloadJson,
        String completionPresentationJson,
        String updatedAt
    ) {
        Log.i(LOG_TAG, "OfflineStorageService -> commitTrainingTerminal -> params: revision=" + revision);
        requireText(sessionId, "sessionId");
        requireRevision(expectedSessionRevision);
        validateAggregate(executionId, planId, 1, revision, snapshotPayloadJson, updatedAt);
        boolean changed = mutate(database -> {
            requireAccount(database);
            if (count(database, "active_session", "id = 1", null) == 0) {
                try (Cursor cursor = database.rawQuery(
                    "SELECT plan_id, payload_version, revision, payload_json, updated_at FROM snapshots WHERE execution_id = ?",
                    new String[] { executionId }
                )) {
                    if (
                        cursor.moveToFirst() &&
                        planId.equals(cursor.getString(0)) &&
                        cursor.getInt(1) == 1 &&
                        cursor.getLong(2) == revision &&
                        snapshotPayloadJson.equals(cursor.getString(3)) &&
                        updatedAt.equals(cursor.getString(4))
                    ) return false;
                }
                throw revisionConflict();
            }
            int deleted = database.delete(
                "active_session",
                "id = 1 AND session_id = ? AND revision = ?",
                new String[] { sessionId, Long.toString(expectedSessionRevision) }
            );
            if (deleted != 1) throw revisionConflict();
            writeSnapshotLocked(database, executionId, planId, revision, snapshotPayloadJson, updatedAt);
            if (completionPresentationJson != null) {
                validateJsonObject(completionPresentationJson, "completionPresentation");
                ContentValues presentation = new ContentValues();
                presentation.put("id", 1);
                presentation.put("account_id", 1);
                presentation.put("execution_id", executionId);
                presentation.put("queue_sequence", queueSequence(database, executionId));
                presentation.put("status", "pending");
                presentation.put("presentation_json", completionPresentationJson);
                presentation.put("updated_at", updatedAt);
                database.insertWithOnConflict(
                    "latest_completion",
                    null,
                    presentation,
                    SQLiteDatabase.CONFLICT_REPLACE
                );
            }
            incrementStateRevision(database);
            return true;
        });
        if (changed) notifySnapshotPending();
        Log.i(LOG_TAG, "OfflineStorageService -> commitTrainingTerminal -> return: committed=" + changed);
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
        boolean changed = mutate(database -> {
            requireAccount(database);
            if (!writeSnapshotLocked(database, executionId, planId, revision, payloadJson, updatedAt, payloadVersion)) return false;
            incrementStateRevision(database);
            return true;
        });
        if (changed) notifySnapshotPending();
    }

    private boolean writeSnapshotLocked(
        SQLiteDatabase database,
        String executionId,
        String planId,
        long revision,
        String payloadJson,
        String updatedAt
    ) {
        return writeSnapshotLocked(database, executionId, planId, revision, payloadJson, updatedAt, 1);
    }

    private boolean writeSnapshotLocked(
        SQLiteDatabase database,
        String executionId,
        String planId,
        long revision,
        String payloadJson,
        String updatedAt,
        int payloadVersion
    ) {
        if (!mayWriteRevision(
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
        )) return false;
        ContentValues snapshotValues = aggregateValues(planId, payloadVersion, revision, payloadJson, updatedAt);
        snapshotValues.put("execution_id", executionId);
        snapshotValues.put("account_id", 1);
        snapshotValues.put("producer_version_code", installedVersionCode());
        snapshotValues.put(
            "sync_contract_version",
            AppCompatibilityManager.SYNC_CONTRACT_VERSION
        );
        int updated = database.update("snapshots", snapshotValues, "execution_id = ?", new String[] { executionId });
        if (updated == 0) database.insertOrThrow("snapshots", null, snapshotValues);
        snapshotWriteHook.afterSnapshotWritten(revision);
        long syncRevision = nextSyncRevision(database, executionId);
        long queueSequence = queueSequence(database, executionId);
        ContentValues syncValues = new ContentValues();
        syncValues.put("execution_id", executionId);
        syncValues.put("snapshot_revision", revision);
        syncValues.put("queue_sequence", queueSequence);
        syncValues.put("status", "pending");
        syncValues.put("attempt_count", 0);
        syncValues.putNull("next_attempt_at");
        syncValues.putNull("reason");
        syncValues.putNull("action_details_json");
        syncValues.put("revision", syncRevision);
        syncValues.put("updated_at", updatedAt);
        database.insertWithOnConflict("sync_state", null, syncValues, SQLiteDatabase.CONFLICT_REPLACE);
        return true;
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

    public int recoverInterruptedSync(String updatedAt) {
        requireIsoInstant(updatedAt, "updatedAt");
        final int[] recovered = { 0 };
        mutate(database -> {
            recovered[0] = count(database, "sync_state", "status = ?", new String[] { "in_flight" });
            if (recovered[0] == 0) return false;
            database.execSQL(
                "UPDATE sync_state SET status = 'pending', next_attempt_at = NULL, " +
                "reason = 'interrupted', revision = revision + 1, updated_at = ? " +
                "WHERE status = 'in_flight'",
                new Object[] { updatedAt }
            );
            incrementStateRevision(database);
            return true;
        });
        return recovered[0];
    }

    public int rearmTemporarySync(String updatedAt) {
        requireIsoInstant(updatedAt, "updatedAt");
        final int[] rearmed = { 0 };
        mutate(database -> {
            rearmed[0] = count(database, "sync_state", "status = ?", new String[] { "retry_wait" });
            if (rearmed[0] == 0) return false;
            database.execSQL(
                "UPDATE sync_state SET status = 'pending', next_attempt_at = NULL, " +
                "revision = revision + 1, updated_at = ? WHERE status = 'retry_wait'",
                new Object[] { updatedAt }
            );
            incrementStateRevision(database);
            return true;
        });
        return rearmed[0];
    }

    public int rearmUpdateRequiredSync(String updatedAt) {
        requireIsoInstant(updatedAt, "updatedAt");
        final int[] rearmed = { 0 };
        mutate(database -> {
            rearmed[0] = count(
                database,
                "sync_state",
                "status = ? AND reason = ? AND execution_id IN " +
                "(SELECT execution_id FROM snapshots WHERE sync_contract_version = ?)",
                new String[] {
                    "action_required",
                    "update-required",
                    Integer.toString(AppCompatibilityManager.SYNC_CONTRACT_VERSION)
                }
            );
            if (rearmed[0] == 0) return false;
            database.execSQL(
                "UPDATE sync_state SET status = 'pending', attempt_count = 0, " +
                "next_attempt_at = NULL, reason = NULL, action_details_json = NULL, " +
                "revision = revision + 1, updated_at = ? " +
                "WHERE status = 'action_required' AND reason = 'update-required' " +
                "AND execution_id IN (SELECT execution_id FROM snapshots " +
                "WHERE sync_contract_version = ?)",
                new Object[] { updatedAt, AppCompatibilityManager.SYNC_CONTRACT_VERSION }
            );
            incrementStateRevision(database);
            return true;
        });
        return rearmed[0];
    }

    public OfflineSyncClaim claimNextSync(String now) {
        requireIsoInstant(now, "now");
        mutationLock.lock();
        OfflineStorageState state = null;
        try {
            ensureOperationalLocked();
            SQLiteDatabase database = helper.getWritableDatabase();
            OfflineSyncClaim result = runTransaction(database, transaction -> {
                try (
                    Cursor cursor = transaction.rawQuery(
                        "SELECT snapshots.execution_id, snapshots.revision, snapshots.payload_json, " +
                        "sync_state.queue_sequence, sync_state.attempt_count, " +
                        "snapshots.sync_contract_version " +
                        "FROM sync_state JOIN snapshots ON snapshots.execution_id = sync_state.execution_id " +
                        "WHERE sync_state.snapshot_revision = snapshots.revision AND " +
                        "(sync_state.status = 'pending' OR " +
                        "(sync_state.status = 'retry_wait' AND sync_state.next_attempt_at <= ?)) " +
                        "ORDER BY sync_state.queue_sequence LIMIT 1",
                        new String[] { now }
                    )
                ) {
                    if (!cursor.moveToFirst()) return null;
                    String executionId = cursor.getString(0);
                    long revision = cursor.getLong(1);
                    ContentValues values = new ContentValues();
                    values.put("status", "in_flight");
                    values.putNull("next_attempt_at");
                    values.putNull("reason");
                    values.put("updated_at", now);
                    int updated = transaction.update(
                        "sync_state",
                        values,
                        "execution_id = ? AND snapshot_revision = ? AND status IN ('pending', 'retry_wait')",
                        new String[] { executionId, Long.toString(revision) }
                    );
                    if (updated != 1) return null;
                    transaction.execSQL(
                        "UPDATE sync_state SET revision = revision + 1 WHERE execution_id = ?",
                        new Object[] { executionId }
                    );
                    incrementStateRevision(transaction);
                    return new OfflineSyncClaim(
                        executionId,
                        revision,
                        cursor.getString(2),
                        cursor.getLong(3),
                        cursor.getInt(4),
                        installedVersionCode(),
                        cursor.getInt(5)
                    );
                }
            });
            if (result != null) state = readStateLocked();
            return result;
        } finally {
            mutationLock.unlock();
            if (state != null) notifyStateChanged(state);
        }
    }

    public boolean markSyncRetry(
        String executionId,
        long expectedRevision,
        int attemptCount,
        String nextAttemptAt,
        String reason,
        String updatedAt
    ) {
        requireSyncTransition(executionId, expectedRevision, attemptCount, reason, updatedAt);
        if (nextAttemptAt != null) requireIsoInstant(nextAttemptAt, "nextAttemptAt");
        return updateClaimedSync(
            executionId,
            expectedRevision,
            "retry_wait",
            attemptCount,
            nextAttemptAt,
            reason,
            null,
            updatedAt
        );
    }

    public boolean releaseSyncPending(
        String executionId,
        long expectedRevision,
        String reason,
        String updatedAt
    ) {
        requireSyncTransition(executionId, expectedRevision, 0, reason, updatedAt);
        return updateClaimedSync(
            executionId,
            expectedRevision,
            "pending",
            0,
            null,
            reason,
            null,
            updatedAt
        );
    }

    public boolean markSyncBlocked(
        String executionId,
        long expectedRevision,
        String reason,
        String updatedAt
    ) {
        requireSyncTransition(executionId, expectedRevision, 0, reason, updatedAt);
        return updateClaimedSync(
            executionId,
            expectedRevision,
            "blocked",
            0,
            null,
            reason,
            null,
            updatedAt
        );
    }

    public boolean markSyncActionRequired(
        String executionId,
        long expectedRevision,
        String reason,
        String actionDetailsJson,
        String updatedAt
    ) {
        requireSyncTransition(executionId, expectedRevision, 0, reason, updatedAt);
        if (actionDetailsJson != null) {
            if (actionDetailsJson.length() > 1_048_576) throw invalidInput("actionDetails");
            try {
                new JSONObject(actionDetailsJson);
            } catch (JSONException error) {
                throw invalidInput("actionDetails");
            }
        }
        return updateClaimedSync(
            executionId,
            expectedRevision,
            "action_required",
            0,
            null,
            reason,
            actionDetailsJson,
            updatedAt
        );
    }

    public boolean completeSync(OfflineSyncClaim claim, String updatedAt) {
        return completeSync(claim, null, updatedAt);
    }

    public boolean completeSync(
        OfflineSyncClaim claim,
        String canonicalCompletionJson,
        String updatedAt
    ) {
        requireIsoInstant(updatedAt, "updatedAt");
        if (canonicalCompletionJson != null) validateJsonObject(canonicalCompletionJson, "completion");
        return mutate(database -> {
            int deleted = database.delete(
                "snapshots",
                "execution_id = ? AND revision = ?",
                new String[] { claim.getExecutionId(), Long.toString(claim.getRevision()) }
            );
            if (deleted != 1) return false;
            if (canonicalCompletionJson != null) {
                ContentValues presentation = new ContentValues();
                presentation.put("status", "canonical");
                presentation.put("presentation_json", canonicalCompletionJson);
                presentation.put("updated_at", updatedAt);
                database.update(
                    "latest_completion",
                    presentation,
                    "id = 1 AND execution_id = ? AND queue_sequence = ?",
                    new String[] {
                        claim.getExecutionId(),
                        Long.toString(claim.getQueueSequence())
                    }
                );
            }
            database.execSQL(
                "DELETE FROM snapshots WHERE execution_id IN (" +
                "SELECT execution_id FROM sync_state WHERE status = 'blocked' AND queue_sequence < ?)",
                new Object[] { claim.getQueueSequence() }
            );
            incrementStateRevision(database);
            return true;
        });
    }

    public String getLatestCompletionJson() {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            try (Cursor cursor = helper.getReadableDatabase().rawQuery(
                "SELECT execution_id, status, presentation_json, updated_at " +
                "FROM latest_completion WHERE id = 1",
                null
            )) {
                if (!cursor.moveToFirst()) return null;
                JSONObject result = new JSONObject();
                result.put("executionId", cursor.getString(0));
                result.put("status", cursor.getString(1));
                result.put("presentation", new JSONObject(cursor.getString(2)));
                result.put("updatedAt", cursor.getString(3));
                return result.toString();
            } catch (JSONException error) {
                throw new OfflineStorageException(
                    "OFFLINE_STORAGE_STATE_INVALID",
                    "Offline completion presentation is invalid.",
                    error
                );
            }
        } finally {
            mutationLock.unlock();
        }
    }

    public OfflineSyncAction getNextSyncAction() {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            try (Cursor cursor = helper.getReadableDatabase().rawQuery(
                "SELECT snapshots.execution_id, snapshots.revision, sync_state.reason, " +
                "snapshots.payload_json, sync_state.action_details_json " +
                "FROM sync_state JOIN snapshots ON snapshots.execution_id = sync_state.execution_id " +
                "WHERE sync_state.status = 'action_required' " +
                "AND sync_state.reason <> 'update-required' " +
                "AND sync_state.snapshot_revision = snapshots.revision " +
                "ORDER BY sync_state.queue_sequence LIMIT 1",
                null
            )) {
                if (!cursor.moveToFirst()) return null;
                return new OfflineSyncAction(
                    cursor.getString(0),
                    cursor.getLong(1),
                    cursor.getString(2),
                    cursor.getString(3),
                    cursor.isNull(4) ? null : cursor.getString(4)
                );
            }
        } finally {
            mutationLock.unlock();
        }
    }

    public boolean resolveSyncConflict(
        String executionId,
        long expectedRevision,
        String choice,
        String conflictToken,
        String updatedAt
    ) {
        requireText(executionId, "executionId");
        requireRevision(expectedRevision);
        if (!"local".equals(choice) && !"server".equals(choice)) throw invalidInput("choice");
        requireText(conflictToken, "conflictToken");
        requireIsoInstant(updatedAt, "updatedAt");
        boolean changed = mutate(database -> {
            try (Cursor cursor = database.rawQuery(
                "SELECT snapshots.payload_json FROM snapshots JOIN sync_state " +
                "ON snapshots.execution_id = sync_state.execution_id " +
                "WHERE snapshots.execution_id = ? AND snapshots.revision = ? " +
                "AND sync_state.status = 'action_required' AND sync_state.reason = 'conflict'",
                new String[] { executionId, Long.toString(expectedRevision) }
            )) {
                if (!cursor.moveToFirst()) return false;
                JSONObject payload = new JSONObject(cursor.getString(0));
                JSONObject resolution = new JSONObject();
                resolution.put("choice", choice);
                resolution.put("conflictToken", conflictToken);
                payload.put("resolution", resolution);
                ContentValues snapshot = new ContentValues();
                snapshot.put("payload_json", payload.toString());
                snapshot.put("updated_at", updatedAt);
                database.update(
                    "snapshots",
                    snapshot,
                    "execution_id = ? AND revision = ?",
                    new String[] { executionId, Long.toString(expectedRevision) }
                );
            } catch (JSONException error) {
                throw invalidInput("conflict");
            }
            ContentValues sync = new ContentValues();
            sync.put("status", "pending");
            sync.put("attempt_count", 0);
            sync.putNull("next_attempt_at");
            sync.putNull("reason");
            sync.putNull("action_details_json");
            sync.put("updated_at", updatedAt);
            int updated = database.update(
                "sync_state",
                sync,
                "execution_id = ? AND snapshot_revision = ? AND status = 'action_required'",
                new String[] { executionId, Long.toString(expectedRevision) }
            );
            if (updated != 1) throw revisionConflict();
            database.execSQL(
                "UPDATE sync_state SET revision = revision + 1 WHERE execution_id = ?",
                new Object[] { executionId }
            );
            incrementStateRevision(database);
            return true;
        });
        if (changed) notifySnapshotPending();
        return changed;
    }

    public boolean reopenStaleConflict(OfflineSyncClaim claim, String updatedAt) {
        requireIsoInstant(updatedAt, "updatedAt");
        boolean changed = mutate(database -> {
            try (Cursor cursor = database.rawQuery(
                "SELECT payload_json FROM snapshots WHERE execution_id = ? AND revision = ?",
                new String[] { claim.getExecutionId(), Long.toString(claim.getRevision()) }
            )) {
                if (!cursor.moveToFirst()) return false;
                JSONObject payload = new JSONObject(cursor.getString(0));
                payload.remove("resolution");
                ContentValues snapshot = new ContentValues();
                snapshot.put("payload_json", payload.toString());
                database.update(
                    "snapshots",
                    snapshot,
                    "execution_id = ? AND revision = ?",
                    new String[] { claim.getExecutionId(), Long.toString(claim.getRevision()) }
                );
            } catch (JSONException error) {
                throw invalidInput("conflict");
            }
            ContentValues sync = new ContentValues();
            sync.put("status", "pending");
            sync.put("attempt_count", 0);
            sync.putNull("next_attempt_at");
            sync.putNull("reason");
            sync.putNull("action_details_json");
            sync.put("updated_at", updatedAt);
            int updated = database.update(
                "sync_state",
                sync,
                "execution_id = ? AND snapshot_revision = ? AND status = 'in_flight'",
                new String[] { claim.getExecutionId(), Long.toString(claim.getRevision()) }
            );
            if (updated != 1) throw revisionConflict();
            database.execSQL(
                "UPDATE sync_state SET revision = revision + 1 WHERE execution_id = ?",
                new Object[] { claim.getExecutionId() }
            );
            incrementStateRevision(database);
            return true;
        });
        if (changed) notifySnapshotPending();
        return changed;
    }

    public boolean discardSyncAction(String executionId, long expectedRevision) {
        requireText(executionId, "executionId");
        requireRevision(expectedRevision);
        return mutate(database -> {
            final String[] completionJson = { null };
            try (Cursor cursor = database.rawQuery(
                "SELECT action_details_json FROM sync_state WHERE execution_id = ? " +
                "AND snapshot_revision = ? AND status = 'action_required'",
                new String[] { executionId, Long.toString(expectedRevision) }
            )) {
                if (!cursor.moveToFirst()) return false;
                if (!cursor.isNull(0)) {
                    JSONObject details = new JSONObject(cursor.getString(0));
                    JSONObject completion = details.optJSONObject("completion");
                    if (completion != null) completionJson[0] = completion.toString();
                }
            } catch (JSONException error) {
                throw invalidInput("actionDetails");
            }
            int deleted = database.delete(
                "snapshots",
                "execution_id = ? AND revision = ? AND execution_id IN (" +
                "SELECT execution_id FROM sync_state WHERE status = 'action_required')",
                new String[] { executionId, Long.toString(expectedRevision) }
            );
            if (deleted == 0) return false;
            if (completionJson[0] != null) {
                ContentValues presentation = new ContentValues();
                presentation.put("status", "canonical");
                presentation.put("presentation_json", completionJson[0]);
                presentation.put("updated_at", Instant.now().toString());
                database.update(
                    "latest_completion",
                    presentation,
                    "id = 1 AND execution_id = ?",
                    new String[] { executionId }
                );
            }
            incrementStateRevision(database);
            return true;
        });
    }

    public String earliestRetryAt() {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            try (
                Cursor cursor = helper
                    .getReadableDatabase()
                    .rawQuery(
                        "SELECT MIN(next_attempt_at) FROM sync_state WHERE status = 'retry_wait'",
                        null
                    )
            ) {
                return cursor.moveToFirst() && !cursor.isNull(0) ? cursor.getString(0) : null;
            }
        } finally {
            mutationLock.unlock();
        }
    }

    public boolean hasSyncReason(String reason) {
        requireText(reason, "reason");
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            return count(
                helper.getReadableDatabase(),
                "sync_state",
                "reason = ?",
                new String[] { reason }
            ) > 0;
        } finally {
            mutationLock.unlock();
        }
    }

    public OfflineSyncState getSyncState(boolean syncing, boolean authenticationRequired) {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            SQLiteDatabase database = helper.getReadableDatabase();
            int pendingCount = count(database, "sync_state", null, null);
            boolean actionRequired = count(
                database,
                "sync_state",
                "status = ?",
                new String[] { "action_required" }
            ) > 0;
            boolean updateRequired = count(
                database,
                "sync_state",
                "reason = ?",
                new String[] { "update-required" }
            ) > 0;
            String publicState;
            if (authenticationRequired && pendingCount > 0) publicState = "authentication-required";
            else if (hasKnownTermsRequirement()) publicState = "terms-required";
            else if (syncing) publicState = "syncing";
            else if (updateRequired) publicState = "update-required";
            else if (actionRequired) publicState = "action-required";
            else if (pendingCount > 0) publicState = "pending";
            else publicState = "idle";
            return new OfflineSyncState(readStateRevision(database), publicState, pendingCount, actionRequired);
        } finally {
            mutationLock.unlock();
        }
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

    public OfflineFileMetadata completeFileForPreparedPlan(
        String fileId,
        long expectedRevision,
        String updatedAt,
        String planId,
        long expectedPlanRevision
    ) {
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            if (!preparedPlanMatchesLocked(planId, expectedPlanRevision)) throw revisionConflict();
            return completeFile(fileId, expectedRevision, updatedAt);
        } finally {
            mutationLock.unlock();
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

    public File getReadyFileForRead(String fileId) {
        Log.i(LOG_TAG, "OfflineStorageService -> getReadyFileForRead -> params: requested=true");
        requireText(fileId, "fileId");
        validateFileId(fileId);
        mutationLock.lock();
        try {
            ensureOperationalLocked();
            OfflineFileMetadata metadata = getFileLocked(fileId);
            File file = readyFile(fileId);
            File result = metadata != null && "ready".equals(metadata.getStatus()) && file.isFile() ? file : null;
            Log.i(LOG_TAG, "OfflineStorageService -> getReadyFileForRead -> return: ready=" + (result != null));
            return result;
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

    public void clearInvalidLeaseDataAtomically() {
        mutationLock.lock();
        OfflineStorageState state = null;
        try {
            ensureOperationalLocked();
            File accountDirectory = accountDirectory();
            File discarded = null;
            if (accountDirectory.exists()) {
                ensureDirectory(discardDirectory());
                discarded = new File(discardDirectory(), UUID.randomUUID().toString());
                if (!accountDirectory.renameTo(discarded))
                    throw new OfflineStorageException(
                        "OFFLINE_STORAGE_CLEAR_FAILED",
                        "Offline lease data could not be isolated."
                    );
            }
            try {
                SQLiteDatabase database = helper.getWritableDatabase();
                runTransaction(database, transaction -> {
                    transaction.delete("latest_completion", null, null);
                    transaction.delete("active_session", null, null);
                    transaction.delete("snapshots", null, null);
                    transaction.delete("prepared_plan", null, null);
                    transaction.delete("offline_files", null, null);
                    incrementStateRevision(transaction);
                    return null;
                });
            } catch (RuntimeException error) {
                if (discarded != null) discarded.renameTo(accountDirectory);
                throw error;
            }
            if (discarded != null && !deleteRecursively(discarded))
                throw new OfflineStorageException(
                    "OFFLINE_STORAGE_CLEAR_FAILED",
                    "Offline lease data could not be removed."
                );
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
                boolean recorded = context
                    .getSharedPreferences(RECOVERY_PREFERENCES, Context.MODE_PRIVATE)
                    .edit()
                    .putString(RECOVERY_KEY, RECOVERY_MIGRATION_RESET)
                    .commit();
                if (!recorded) throw new OfflineStorageException(
                    "OFFLINE_STORAGE_RECOVERY_RECORD_FAILED",
                    "Offline storage recovery could not be recorded."
                );
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
            cursor.getString(5),
            cursor.getColumnCount() > 6 && !cursor.isNull(6) ? cursor.getString(6) : null,
            cursor.getColumnCount() > 7 && !cursor.isNull(7) ? cursor.getString(7) : null
        );
    }

    private boolean preparedPlanMatchesLocked(String planId, long revision) {
        try (
            Cursor cursor = helper
                .getReadableDatabase()
                .rawQuery(
                    "SELECT 1 FROM prepared_plan WHERE plan_id = ? AND revision = ?",
                    new String[] { planId, Long.toString(revision) }
                )
        ) {
            return cursor.moveToFirst();
        }
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
                context.getSharedPreferences(RECOVERY_PREFERENCES, Context.MODE_PRIVATE)
                    .getString(RECOVERY_KEY, "none"),
                exists(database, "account_state"),
                exists(database, "prepared_plan"),
                exists(database, "active_session"),
                count(database, "sync_state", null, null),
                count(database, "offline_files", "status = ?", new String[] { "temporary" }),
                count(database, "offline_files", "status = ?", new String[] { "ready" })
            );
        }
    }

    private long installedVersionCode() {
        return new AppCompatibilityManager(context).getState().getInstalledVersionCode();
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

    private void notifySnapshotPending() {
        for (SnapshotListener listener : snapshotListeners) {
            try {
                listener.onSnapshotPending();
            } catch (RuntimeException error) {
                Log.e(
                    LOG_TAG,
                    "OfflineStorageService -> notifySnapshotPending -> listener failed: category=" +
                    error.getClass().getSimpleName()
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

    private void validatePreparedPlanExpectation(
        SQLiteDatabase database,
        String planId,
        String expectedPlanId,
        Long expectedRevision
    ) {
        try (Cursor cursor = database.rawQuery(
            "SELECT revision FROM prepared_plan WHERE plan_id = ?",
            new String[] { planId }
        )) {
            if (!cursor.moveToFirst()) {
                if (expectedPlanId != null) throw revisionConflict();
                return;
            }
            if (
                expectedPlanId != null &&
                (!expectedPlanId.equals(planId) || expectedRevision.longValue() != cursor.getLong(0))
            ) throw revisionConflict();
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

    private long queueSequence(SQLiteDatabase database, String executionId) {
        try (
            Cursor cursor = database.rawQuery(
                "SELECT queue_sequence FROM sync_state WHERE execution_id = ?",
                new String[] { executionId }
            )
        ) {
            if (cursor.moveToFirst()) return cursor.getLong(0);
        }
        try (
            Cursor cursor = database.rawQuery(
                "SELECT next_queue_sequence FROM engine_metadata WHERE id = 1",
                null
            )
        ) {
            if (!cursor.moveToFirst()) throw new OfflineStorageException(
                "OFFLINE_STORAGE_STATE_INVALID",
                "Offline storage queue sequence is unavailable."
            );
            long result = cursor.getLong(0);
            database.execSQL(
                "UPDATE engine_metadata SET next_queue_sequence = next_queue_sequence + 1 WHERE id = 1"
            );
            return result;
        }
    }

    private boolean updateClaimedSync(
        String executionId,
        long expectedRevision,
        String status,
        int attemptCount,
        String nextAttemptAt,
        String reason,
        String actionDetailsJson,
        String updatedAt
    ) {
        return mutate(database -> {
            ContentValues values = new ContentValues();
            values.put("status", status);
            values.put("attempt_count", attemptCount);
            if (nextAttemptAt == null) values.putNull("next_attempt_at");
            else values.put("next_attempt_at", nextAttemptAt);
            values.put("reason", reason);
            if (actionDetailsJson == null) values.putNull("action_details_json");
            else values.put("action_details_json", actionDetailsJson);
            values.put("updated_at", updatedAt);
            int updated = database.update(
                "sync_state",
                values,
                "execution_id = ? AND snapshot_revision = ? AND status = 'in_flight'",
                new String[] { executionId, Long.toString(expectedRevision) }
            );
            if (updated != 1) return false;
            database.execSQL(
                "UPDATE sync_state SET revision = revision + 1 WHERE execution_id = ?",
                new Object[] { executionId }
            );
            incrementStateRevision(database);
            return true;
        });
    }

    private static void requireSyncTransition(
        String executionId,
        long expectedRevision,
        int attemptCount,
        String reason,
        String updatedAt
    ) {
        requireText(executionId, "executionId");
        requireRevision(expectedRevision);
        if (attemptCount < 0) throw invalidInput("attemptCount");
        requireText(reason, "reason");
        requireIsoInstant(updatedAt, "updatedAt");
    }

    private static long readStateRevision(SQLiteDatabase database) {
        try (
            Cursor cursor = database.rawQuery(
                "SELECT state_revision FROM engine_metadata WHERE id = 1",
                null
            )
        ) {
            if (!cursor.moveToFirst()) throw new OfflineStorageException(
                "OFFLINE_STORAGE_STATE_INVALID",
                "Offline storage state is unavailable."
            );
            return cursor.getLong(0);
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

    private static void validateJsonObject(String value, String field) {
        try {
            new JSONObject(value);
        } catch (JSONException | NullPointerException error) {
            throw invalidInput(field);
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
