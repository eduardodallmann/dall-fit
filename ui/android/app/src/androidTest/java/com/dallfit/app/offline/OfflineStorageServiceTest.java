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
        incompatible.setVersion(2);
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
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new AssertionError(error);
        }
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
