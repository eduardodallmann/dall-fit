package com.dallfit.app.offline;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class OfflineStorageServiceTest {
    private Context context;
    private String databaseName;
    private String directoryName;
    private OfflineStorageService service;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        String suffix = UUID.randomUUID().toString();
        databaseName = "offline-test-" + suffix + ".db";
        directoryName = "offline-test-" + suffix;
        service = new OfflineStorageService(context, databaseName, directoryName);
    }

    @After
    public void tearDown() {
        if (service != null) service.close();
        context.deleteDatabase(databaseName);
        deleteRecursively(new File(context.getFilesDir(), directoryName));
    }

    @Test
    public void storesOpaqueAggregatesAndRemovesOnlyTheExpectedSnapshotRevision() {
        OfflineStorageState initial = service.initialize();
        assertTrue(initial.isInitialized());
        assertFalse(initial.isAccountBound());

        service.bindAccount("person-a");
        OfflineStorageException mismatch = assertThrows(
            OfflineStorageException.class,
            () -> service.bindAccount("person-b")
        );
        assertEquals("OFFLINE_STORAGE_ACCOUNT_MISMATCH", mismatch.getCode());
        service.putPreparedPlan(
            "plan-a",
            1,
            0,
            "{\"workouts\":[{\"futureShape\":true}]}",
            "2026-09-13T12:00:00Z",
            "2026-09-20T12:00:00Z"
        );
        assertThrows(
            OfflineStorageException.class,
            () -> service.putPreparedPlan(
                "plan-b",
                1,
                0,
                "{\"workouts\":[]}",
                "2026-09-13T12:00:00Z",
                "2026-09-20T12:00:00Z"
            )
        );
        service.putPreparedPlan(
            "plan-b",
            1,
            0,
            "{\"workouts\":[]}",
            "2026-09-13T12:00:00Z",
            "2026-09-20T12:00:00Z",
            "plan-a",
            0L
        );
        assertEquals("plan-b", service.getPreparedPlan().getPlanId());
        assertEquals("2026-09-13T12:00:00Z", service.getPreparedPlan().getValidatedAt());
        assertEquals("2026-09-20T12:00:00Z", service.getPreparedPlan().getExpiresAt());
        service.putActiveSession(
            "session-a",
            "plan-a",
            1,
            0,
            "{\"loads\":[]}",
            "2026-09-13T12:01:00Z"
        );
        service.putSnapshot(
            "execution-a",
            "plan-a",
            1,
            0,
            "{\"completed\":false}",
            "2026-09-13T12:02:00Z"
        );
        long stateRevision = service.getState().getRevision();
        service.putSnapshot(
            "execution-a",
            "plan-a",
            1,
            0,
            "{\"completed\":false}",
            "2026-09-13T12:02:00Z"
        );
        assertEquals(stateRevision, service.getState().getRevision());
        OfflineStorageException conflictingEnvelope = assertThrows(
            OfflineStorageException.class,
            () -> service.putSnapshot(
                "execution-a",
                "plan-b",
                1,
                0,
                "{\"completed\":false}",
                "2026-09-13T12:02:00Z"
            )
        );
        assertEquals("OFFLINE_STORAGE_REVISION_CONFLICT", conflictingEnvelope.getCode());

        StoredAggregate snapshot = service.getSnapshot("execution-a");
        assertNotNull(snapshot);
        assertEquals("{\"completed\":false}", snapshot.getPayloadJson());
        assertTrue(service.hasPendingChanges());
        assertFalse(service.removeSnapshot("execution-a", 1));
        assertTrue(service.removeSnapshot("execution-a", 0));
        assertNull(service.getSnapshot("execution-a"));
        assertTrue(service.hasPendingChanges());

        assertTrue(service.removeActiveSession("session-a", 0));
        assertFalse(service.hasPendingChanges());
    }

    @Test
    public void serializesConcurrentSnapshotRevisionsAndKeepsTheNewestValue() throws Exception {
        service.initialize();
        service.bindAccount("person-a");
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> older = executor.submit(() -> {
                await(start);
                try {
                    service.putSnapshot(
                        "execution-a",
                        "plan-a",
                        1,
                        1,
                        "{\"revision\":1}",
                        "2026-09-13T12:01:00Z"
                    );
                } catch (OfflineStorageException error) {
                    assertEquals("OFFLINE_STORAGE_REVISION_CONFLICT", error.getCode());
                }
            });
            Future<?> newer = executor.submit(() -> {
                await(start);
                service.putSnapshot(
                    "execution-a",
                    "plan-a",
                    1,
                    2,
                    "{\"revision\":2}",
                    "2026-09-13T12:02:00Z"
                );
            });
            start.countDown();
            older.get();
            newer.get();
        } finally {
            executor.shutdownNow();
        }

        StoredAggregate stored = service.getSnapshot("execution-a");
        assertNotNull(stored);
        assertEquals(2, stored.getRevision());
        assertEquals("{\"revision\":2}", stored.getPayloadJson());
    }

    @Test
    public void rollsBackSnapshotAndSyncStateWhenTheCompoundWriteFails() {
        service.close();
        service = new OfflineStorageService(
            context,
            databaseName,
            directoryName,
            revision -> {
                if (revision == 1) throw new IllegalStateException("injected");
            }
        );
        service.initialize();
        service.bindAccount("person-a");
        service.putSnapshot(
            "execution-a",
            "plan-a",
            1,
            0,
            "{\"revision\":0}",
            "2026-09-13T12:00:00Z"
        );

        assertThrows(
            IllegalStateException.class,
            () -> service.putSnapshot(
                "execution-a",
                "plan-a",
                1,
                1,
                "{\"revision\":1}",
                "2026-09-13T12:01:00Z"
            )
        );

        StoredAggregate stored = service.getSnapshot("execution-a");
        assertNotNull(stored);
        assertEquals(0, stored.getRevision());
        assertEquals("{\"revision\":0}", stored.getPayloadJson());
        assertEquals(1, service.getState().getPendingSnapshotCount());
    }

    @Test
    public void commitsTrainingSessionAndTerminalAsAtomicTransitions() {
        service.initialize();
        service.bindAccount("person-a");

        service.commitTrainingSession(
            "session-a",
            "execution-a",
            "plan-a",
            0,
            "{\"session\":{\"version\":0}}",
            "{\"payloadVersion\":1,\"revision\":0,\"snapshot\":{\"state\":\"in-progress\"}}",
            "2026-09-13T12:00:00Z"
        );

        assertNotNull(service.getActiveSession());
        assertNotNull(service.getSnapshot("execution-a"));
        assertEquals(1, service.getState().getPendingSnapshotCount());

        service.commitTrainingTerminal(
            "session-a",
            0,
            "execution-a",
            "plan-a",
            1,
            "{\"payloadVersion\":1,\"revision\":1,\"snapshot\":{\"state\":\"completed\"}}",
            "2026-09-13T12:10:00Z"
        );

        assertNull(service.getActiveSession());
        assertEquals(1, service.getSnapshot("execution-a").getRevision());
        assertTrue(service.getSnapshot("execution-a").getPayloadJson().contains("completed"));
        assertEquals(1, service.getState().getPendingSnapshotCount());
    }

    @Test
    public void rollsBackTerminalWhenExpectedSessionRevisionDoesNotMatch() {
        service.initialize();
        service.bindAccount("person-a");
        service.commitTrainingSession(
            "session-a",
            "execution-a",
            "plan-a",
            2,
            "{\"session\":{\"version\":2}}",
            "{\"payloadVersion\":1,\"revision\":2,\"snapshot\":{\"state\":\"in-progress\"}}",
            "2026-09-13T12:00:00Z"
        );

        OfflineStorageException error = assertThrows(
            OfflineStorageException.class,
            () -> service.commitTrainingTerminal(
                "session-a",
                1,
                "execution-a",
                "plan-a",
                3,
                "{\"snapshot\":{\"state\":\"cancelled\"}}",
                "2026-09-13T12:01:00Z"
            )
        );

        assertEquals("OFFLINE_STORAGE_REVISION_CONFLICT", error.getCode());
        assertNotNull(service.getActiveSession());
        assertEquals(2, service.getSnapshot("execution-a").getRevision());
    }

    @Test
    public void publishesCompletedFilesAndClearsRowsAndBytesIdempotently() throws Exception {
        service.initialize();
        service.bindAccount("person-a");
        service.registerTemporaryFile(
            "image-a",
            "plan-a",
            "image/jpeg",
            0,
            "2026-09-13T12:00:00Z"
        );
        File temporary = service.getTemporaryFileForNativeWrite("image-a");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write("fixture".getBytes(StandardCharsets.UTF_8));
        }

        OfflineFileMetadata ready = service.completeFile(
            "image-a",
            0,
            "2026-09-13T12:01:00Z"
        );
        assertEquals("ready", ready.getStatus());
        assertEquals(7, ready.getSizeBytes());
        assertTrue(new File(context.getFilesDir(), directoryName + "/account/files/image-a.data").isFile());
        OfflineFileMetadata replacement = service.registerTemporaryFile(
            "image-a",
            "plan-a",
            "image/jpeg",
            1,
            "2026-09-13T12:02:00Z",
            0L
        );
        assertEquals("temporary", replacement.getStatus());
        assertFalse(new File(context.getFilesDir(), directoryName + "/account/files/image-a.data").exists());

        service.clearAccountDataAtomically();
        service.clearAccountDataAtomically();

        assertNull(service.getFile("image-a"));
        assertFalse(new File(context.getFilesDir(), directoryName + "/account").exists());
        assertFalse(service.getState().isAccountBound());
    }

    @Test
    public void rejectsAFileCommitAfterThePreparedPlanRevisionChanges() throws Exception {
        service.initialize();
        service.bindAccount("person-a");
        service.putPreparedPlan(
            "plan-a",
            1,
            1,
            "{\"workouts\":[]}",
            "2026-09-13T12:00:00Z",
            "2026-09-20T12:00:00Z"
        );
        service.registerTemporaryFileForPreparedPlan(
            "image-a",
            "plan-a",
            "image/webp",
            1,
            "2026-09-13T12:00:00Z",
            1
        );
        try (FileOutputStream output = new FileOutputStream(service.getTemporaryFileForNativeWrite("image-a"))) {
            output.write("fixture".getBytes(StandardCharsets.UTF_8));
        }
        service.putPreparedPlan(
            "plan-a",
            1,
            2,
            "{\"workouts\":[]}",
            "2026-09-13T12:01:00Z",
            "2026-09-20T12:01:00Z"
        );

        OfflineStorageException error = assertThrows(
            OfflineStorageException.class,
            () -> service.completeFileForPreparedPlan(
                "image-a",
                1,
                "2026-09-13T12:02:00Z",
                "plan-a",
                1
            )
        );

        assertEquals("OFFLINE_STORAGE_REVISION_CONFLICT", error.getCode());
        assertEquals("temporary", service.getFile("image-a").getStatus());
    }

    @Test
    public void removesAbandonedTemporaryFilesDuringTheNextInitialization() {
        service.initialize();
        service.bindAccount("person-a");
        service.registerTemporaryFile(
            "image-a",
            "plan-a",
            "image/jpeg",
            0,
            "2026-09-13T12:00:00Z"
        );
        File temporary = service.getTemporaryFileForNativeWrite("image-a");
        assertTrue(temporary.isFile());
        service.close();

        service = new OfflineStorageService(context, databaseName, directoryName);
        OfflineStorageState state = service.initialize();

        assertFalse(temporary.exists());
        assertNull(service.getFile("image-a"));
        assertEquals(0, state.getTemporaryFileCount());
    }

    @Test
    public void rejectsFileIdentifiersThatCouldBecomePaths() {
        service.initialize();
        service.bindAccount("person-a");

        OfflineStorageException error = assertThrows(
            OfflineStorageException.class,
            () -> service.registerTemporaryFile(
                "../outside",
                null,
                "image/jpeg",
                0,
                "2026-09-13T12:00:00Z"
            )
        );

        assertEquals("OFFLINE_STORAGE_INVALID_INPUT", error.getCode());
    }

    @Test
    public void resetsAnIncompatibleDatabaseAndRecordsOnlyTheRecoveryCategory() {
        service.close();
        SQLiteDatabase incompatible = context.openOrCreateDatabase(databaseName, Context.MODE_PRIVATE, null);
        incompatible.execSQL(
            "CREATE TABLE engine_metadata (id INTEGER PRIMARY KEY, reset_generation INTEGER NOT NULL)"
        );
        incompatible.execSQL("INSERT INTO engine_metadata (id, reset_generation) VALUES (1, 4)");
        incompatible.setVersion(3);
        incompatible.close();
        File stale = new File(context.getFilesDir(), directoryName + "/account/files/stale.data");
        assertTrue(stale.getParentFile().mkdirs());
        try {
            assertTrue(stale.createNewFile());
        } catch (Exception error) {
            throw new AssertionError(error);
        }
        service = new OfflineStorageService(context, databaseName, directoryName);

        OfflineStorageState state = service.initialize();

        assertEquals("migration-reset", state.getRecovery());
        assertEquals(5, state.getResetGeneration());
        assertFalse(stale.exists());
        assertFalse(state.isAccountBound());
    }

    @Test
    public void rollsBackAnInterruptedPlatformMigration() {
        String migrationDatabase = databaseName + "-migration";
        SQLiteDatabase initial = context.openOrCreateDatabase(migrationDatabase, Context.MODE_PRIVATE, null);
        initial.execSQL("CREATE TABLE preserved (value TEXT NOT NULL)");
        initial.execSQL("INSERT INTO preserved (value) VALUES ('before')");
        initial.setVersion(1);
        initial.close();

        SQLiteOpenHelper interrupted = new SQLiteOpenHelper(context, migrationDatabase, null, 2) {
            @Override
            public void onCreate(SQLiteDatabase database) {}

            @Override
            public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
                database.execSQL("CREATE TABLE partial (value TEXT)");
                throw new IllegalStateException("injected");
            }
        };

        assertThrows(IllegalStateException.class, interrupted::getWritableDatabase);
        interrupted.close();
        SQLiteDatabase reopened = SQLiteDatabase.openDatabase(
            context.getDatabasePath(migrationDatabase).getPath(),
            null,
            SQLiteDatabase.OPEN_READONLY
        );
        assertEquals(1, reopened.getVersion());
        try (android.database.Cursor cursor = reopened.rawQuery(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'partial'",
            null
        )) {
            assertTrue(cursor.moveToFirst());
            assertEquals(0, cursor.getInt(0));
        }
        reopened.close();
        context.deleteDatabase(migrationDatabase);
    }

    @Test
    public void providerSharesOneServiceInstance() {
        assertTrue(OfflineStorageProvider.get(context) == OfflineStorageProvider.get(context));
        assertTrue(
            OfflineStorageProvider.getSyncEngine(context) ==
            OfflineStorageProvider.getSyncEngine(context)
        );
    }

    @Test
    public void migratesVersionOnePendingRowsInTheirExistingDeterministicOrder() {
        service.close();
        SQLiteDatabase versionOne = context.openOrCreateDatabase(
            databaseName,
            Context.MODE_PRIVATE,
            null
        );
        createVersionOneSchema(versionOne);
        versionOne.execSQL("INSERT INTO account_state (id, person_id) VALUES (1, 'person-a')");
        versionOne.execSQL(
            "INSERT INTO snapshots " +
            "(execution_id, account_id, plan_id, payload_version, revision, payload_json, updated_at) " +
            "VALUES ('z-first', 1, 'plan-a', 1, 2, '{\"revision\":2}', '2026-09-14T12:00:00Z')"
        );
        versionOne.execSQL(
            "INSERT INTO snapshots " +
            "(execution_id, account_id, plan_id, payload_version, revision, payload_json, updated_at) " +
            "VALUES ('a-second', 1, 'plan-a', 1, 1, '{\"revision\":1}', '2026-09-14T12:01:00Z')"
        );
        versionOne.execSQL(
            "INSERT INTO sync_state (execution_id, snapshot_revision, status, revision, updated_at) " +
            "VALUES ('z-first', 2, 'pending', 4, '2026-09-14T12:00:00Z')"
        );
        versionOne.execSQL(
            "INSERT INTO sync_state (execution_id, snapshot_revision, status, revision, updated_at) " +
            "VALUES ('a-second', 1, 'pending', 3, '2026-09-14T12:01:00Z')"
        );
        versionOne.setVersion(1);
        versionOne.close();

        service = new OfflineStorageService(context, databaseName, directoryName);
        OfflineStorageState state = service.initialize();
        OfflineSyncClaim first = service.claimNextSync("2026-09-14T12:02:00Z");

        assertEquals("none", state.getRecovery());
        assertNotNull(first);
        assertEquals("z-first", first.getExecutionId());
        assertEquals(1, first.getQueueSequence());
        service.putSnapshot(
            "z-first",
            "plan-a",
            1,
            3,
            "{\"revision\":3}",
            "2026-09-14T12:03:00Z"
        );
        OfflineSyncClaim updated = service.claimNextSync("2026-09-14T12:04:00Z");
        assertNotNull(updated);
        assertEquals("z-first", updated.getExecutionId());
        assertEquals(1, updated.getQueueSequence());
    }

    @Test
    public void claimsByLocalSequenceAndKeepsANewerRevisionWrittenDuringUpload() {
        service.initialize();
        service.bindAccount("person-a");
        service.putSnapshot(
            "ffff-execution",
            "plan-a",
            1,
            0,
            "{\"executionId\":\"ffff-execution\",\"revision\":0}",
            "2026-09-14T12:00:00Z"
        );
        service.putSnapshot(
            "aaaa-execution",
            "plan-a",
            1,
            0,
            "{\"executionId\":\"aaaa-execution\",\"revision\":0}",
            "2026-09-14T12:01:00Z"
        );

        OfflineSyncClaim first = service.claimNextSync("2026-09-14T12:02:00Z");
        assertNotNull(first);
        assertEquals("ffff-execution", first.getExecutionId());
        service.putSnapshot(
            "ffff-execution",
            "plan-a",
            1,
            1,
            "{\"executionId\":\"ffff-execution\",\"revision\":1}",
            "2026-09-14T12:03:00Z"
        );

        assertFalse(service.completeSync(first, "2026-09-14T12:04:00Z"));
        OfflineSyncClaim newest = service.claimNextSync("2026-09-14T12:05:00Z");
        assertNotNull(newest);
        assertEquals("ffff-execution", newest.getExecutionId());
        assertEquals(1, newest.getRevision());
    }

    @Test
    public void recoversInterruptedClaimsAndRemovesOnlyOlderBlockedExecutions() {
        service.initialize();
        service.bindAccount("person-a");
        service.putSnapshot("execution-a", "plan-a", 1, 0, "{\"revision\":0}", "2026-09-14T12:00:00Z");
        service.putSnapshot("execution-b", "plan-a", 1, 0, "{\"revision\":0}", "2026-09-14T12:01:00Z");
        OfflineSyncClaim first = service.claimNextSync("2026-09-14T12:02:00Z");
        assertNotNull(first);
        assertEquals(1, service.recoverInterruptedSync("2026-09-14T12:03:00Z"));
        OfflineSyncClaim recovered = service.claimNextSync("2026-09-14T12:04:00Z");
        assertEquals(first.getExecutionId(), recovered.getExecutionId());
        assertTrue(service.markSyncBlocked(
            recovered.getExecutionId(),
            recovered.getRevision(),
            "validation_error",
            "2026-09-14T12:05:00Z"
        ));

        OfflineSyncClaim second = service.claimNextSync("2026-09-14T12:06:00Z");
        assertEquals("execution-b", second.getExecutionId());
        assertTrue(service.completeSync(second, "2026-09-14T12:07:00Z"));
        assertNull(service.getSnapshot("execution-a"));
        assertNull(service.getSnapshot("execution-b"));
    }

    @Test
    public void preservesActionRequiredAndRearmsTemporaryFailures() {
        service.initialize();
        service.bindAccount("person-a");
        service.putSnapshot("execution-a", "plan-a", 1, 0, "{\"revision\":0}", "2026-09-14T12:00:00Z");
        OfflineSyncClaim claim = service.claimNextSync("2026-09-14T12:01:00Z");
        assertTrue(service.markSyncRetry(
            claim.getExecutionId(),
            claim.getRevision(),
            5,
            null,
            "network",
            "2026-09-14T12:02:00Z"
        ));
        assertNull(service.claimNextSync("2026-09-14T12:03:00Z"));
        assertEquals(1, service.rearmTemporarySync("2026-09-14T12:04:00Z"));
        OfflineSyncClaim retried = service.claimNextSync("2026-09-14T12:05:00Z");
        assertNotNull(retried);
        assertTrue(service.markSyncActionRequired(
            retried.getExecutionId(),
            retried.getRevision(),
            "conflict",
            "{\"allowedResolution\":\"local-or-server\"}",
            "2026-09-14T12:06:00Z"
        ));
        OfflineSyncState state = service.getSyncState(false, false);
        assertEquals("action-required", state.getState());
        assertTrue(state.isActionRequired());
        assertEquals(1, state.getPendingCount());
    }

    @Test
    public void promotesOnlyTheLatestCompletionWithTheMatchingQueueSequence() {
        service.initialize();
        service.bindAccount("person-a");
        service.commitTrainingSession(
            "session-a",
            "execution-a",
            "plan-a",
            0,
            "{\"session\":{\"version\":0}}",
            "{\"executionId\":\"execution-a\",\"revision\":0}",
            "2026-09-14T12:00:00Z"
        );
        service.commitTrainingTerminal(
            "session-a",
            0,
            "execution-a",
            "plan-a",
            1,
            "{\"executionId\":\"execution-a\",\"revision\":1}",
            "{\"workoutName\":\"Treino A\"}",
            "2026-09-14T12:01:00Z"
        );
        OfflineSyncClaim first = service.claimNextSync("2026-09-14T12:02:00Z");
        service.commitTrainingSession(
            "session-b",
            "execution-b",
            "plan-a",
            0,
            "{\"session\":{\"version\":0}}",
            "{\"executionId\":\"execution-b\",\"revision\":0}",
            "2026-09-14T12:03:00Z"
        );
        service.commitTrainingTerminal(
            "session-b",
            0,
            "execution-b",
            "plan-a",
            1,
            "{\"executionId\":\"execution-b\",\"revision\":1}",
            "{\"workoutName\":\"Treino B\"}",
            "2026-09-14T12:04:00Z"
        );

        assertTrue(service.completeSync(
            first,
            "{\"id\":\"execution-a\",\"workoutName\":\"Canônico A\"}",
            "2026-09-14T12:05:00Z"
        ));

        String latest = service.getLatestCompletionJson();
        assertTrue(latest.contains("execution-b"));
        assertTrue(latest.contains("Treino B"));
        assertTrue(latest.contains("pending"));
        assertFalse(latest.contains("Canônico A"));
    }

    @Test
    public void resolvesTheCanonicalConflictActionByReusingTheSnapshot() {
        service.initialize();
        service.bindAccount("person-a");
        service.putSnapshot(
            "execution-a",
            "plan-a",
            1,
            3,
            "{\"executionId\":\"execution-a\",\"revision\":3}",
            "2026-09-14T12:00:00Z"
        );
        OfflineSyncClaim claim = service.claimNextSync("2026-09-14T12:01:00Z");
        assertTrue(service.markSyncActionRequired(
            claim.getExecutionId(),
            claim.getRevision(),
            "conflict",
            "{\"allowedResolution\":\"local-or-server\",\"conflictToken\":\"token-a\"}",
            "2026-09-14T12:02:00Z"
        ));
        OfflineSyncAction action = service.getNextSyncAction();
        assertNotNull(action);
        assertEquals("conflict", action.getReason());

        assertTrue(service.resolveSyncConflict(
            action.getExecutionId(),
            action.getRevision(),
            "server",
            "token-a",
            "2026-09-14T12:03:00Z"
        ));

        assertNull(service.getNextSyncAction());
        OfflineSyncClaim resolved = service.claimNextSync("2026-09-14T12:04:00Z");
        assertTrue(resolved.getPayloadJson().contains("\"choice\":\"server\""));
        assertTrue(resolved.getPayloadJson().contains("\"conflictToken\":\"token-a\""));
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new AssertionError(error);
        }
    }

    private static void createVersionOneSchema(SQLiteDatabase database) {
        database.execSQL(
            "CREATE TABLE engine_metadata (" +
            "id INTEGER PRIMARY KEY CHECK (id = 1)," +
            "state_revision INTEGER NOT NULL DEFAULT 0," +
            "reset_generation INTEGER NOT NULL DEFAULT 0," +
            "last_recovery TEXT NULL)"
        );
        database.execSQL(
            "INSERT INTO engine_metadata (id, state_revision, reset_generation, last_recovery) " +
            "VALUES (1, 0, 0, NULL)"
        );
        database.execSQL(
            "CREATE TABLE account_state (id INTEGER PRIMARY KEY, person_id TEXT NOT NULL)"
        );
        database.execSQL("CREATE TABLE prepared_plan (id INTEGER PRIMARY KEY)");
        database.execSQL("CREATE TABLE active_session (id INTEGER PRIMARY KEY)");
        database.execSQL(
            "CREATE TABLE snapshots (" +
            "execution_id TEXT PRIMARY KEY," +
            "account_id INTEGER NOT NULL REFERENCES account_state(id) ON DELETE CASCADE," +
            "plan_id TEXT NOT NULL," +
            "payload_version INTEGER NOT NULL," +
            "revision INTEGER NOT NULL," +
            "payload_json TEXT NOT NULL," +
            "updated_at TEXT NOT NULL)"
        );
        database.execSQL(
            "CREATE TABLE sync_state (" +
            "execution_id TEXT PRIMARY KEY REFERENCES snapshots(execution_id) ON DELETE CASCADE," +
            "snapshot_revision INTEGER NOT NULL," +
            "status TEXT NOT NULL CHECK (status IN ('pending'))," +
            "revision INTEGER NOT NULL," +
            "updated_at TEXT NOT NULL)"
        );
        database.execSQL(
            "CREATE TABLE offline_files (" +
            "file_id TEXT PRIMARY KEY," +
            "relative_path TEXT NOT NULL," +
            "status TEXT NOT NULL)"
        );
    }

    private static void deleteRecursively(File file) {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursively(child);
        }
        assertTrue(file.delete());
    }
}
