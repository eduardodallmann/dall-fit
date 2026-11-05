package com.dallfit.app.offline;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class TermsAccessTest {
    private Context context;
    private String databaseName;
    private String directoryName;
    private OfflineStorageService storage;
    private final ScheduledThreadPoolExecutor executor = new ScheduledThreadPoolExecutor(1);

    @Before public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        databaseName = "terms-test-" + UUID.randomUUID() + ".db";
        directoryName = "terms-test-" + UUID.randomUUID();
        storage = new OfflineStorageService(context, databaseName, directoryName);
        storage.initialize(); storage.bindAccount("person-a");
    }
    @After public void tearDown() {
        executor.shutdownNow(); storage.close(); context.deleteDatabase(databaseName);
        new java.io.File(context.getFilesDir(), directoryName).delete();
    }
    private static JSONObject reference(int number) throws Exception {
        return new JSONObject().put("id", "10900000000000000000000" + number).put("publicationNumber", number).put("contentHash", "a".repeat(64));
    }
    private static String accepted(int number) throws Exception {
        JSONObject ref = reference(number);
        JSONObject receipt = new JSONObject().put("id", "receipt-" + number).put("termsVersionId", ref.getString("id")).put("publicationNumber", number).put("contentHash", ref.getString("contentHash")).put("acceptedAt", "2026-08-01T12:00:00Z").put("channel", "native").put("accepted", true).put("isAdult", true);
        return new JSONObject().put("state", "accepted").put("current", ref).put("acceptance", receipt).toString();
    }
    @Test public void migratesVersionFiveWithoutFabricatingProofOrRemovingTraining() throws Exception {
        storage.putPreparedPlan("plan-a", 1, 7, "{\"workouts\":[]}", "2026-08-01T12:00:00Z", "2026-08-08T12:00:00Z");
        storage.putSnapshot("execution-a", "plan-a", 1, 3, "{\"revision\":3}", "2026-08-01T12:00:00Z");
        storage.close();
        android.database.sqlite.SQLiteDatabase legacy = context.openOrCreateDatabase(databaseName, Context.MODE_PRIVATE, null);
        legacy.execSQL("DROP TABLE terms_access"); legacy.setVersion(5); legacy.close();
        storage = new OfflineStorageService(context, databaseName, directoryName);
        assertEquals("none", storage.initialize().getRecovery());
        assertNull(storage.getTermsAccessJson("person-a"));
        assertThrows(OfflineStorageException.class, () -> storage.requireTermsAccepted());
        assertTrue(storage.hasPendingChanges());
        assertNotNull(storage.getPreparedPlan("plan-a"));
        storage.recordTermsAccess("person-a", accepted(1));
        storage.requireTermsAccepted();
    }
    @Test public void requiresProofAndDoesNotRegressKnownPolicyOrMixAccounts() throws Exception {
        assertNull(storage.getTermsAccessJson("person-a"));
        assertThrows(OfflineStorageException.class, () -> storage.requireTermsAccepted());
        storage.recordTermsAccess("person-a", accepted(1)); storage.requireTermsAccepted();
        storage.noteTermsRequired(reference(2).toString(), "person-a");
        storage.close(); storage = new OfflineStorageService(context, databaseName, directoryName); storage.initialize();
        assertEquals("required", new JSONObject(storage.getTermsAccessJson("person-a")).getString("state"));
        storage.recordTermsAccess("person-a", accepted(1));
        assertTrue(storage.hasKnownTermsRequirement());
        storage.recordTermsAccess("person-a", accepted(2)); storage.requireTermsAccepted();
        assertFalse(storage.hasKnownTermsRequirement());
        assertThrows(OfflineStorageException.class, () -> storage.recordTermsAccess("person-b", accepted(2)));
        storage.clearAccountDataAtomically(); storage.bindAccount("person-b");
        assertNull(storage.getTermsAccessJson("person-b"));
    }
    @Test public void stopsTheWorkerWithoutLosingSnapshotsAndResumesAfterExplicitAcceptance() throws Exception {
        storage.recordTermsAccess("person-a", accepted(1));
        storage.putSnapshot("execution-a", "plan-a", 1, 0, "{\"executionId\":\"execution-a\",\"revision\":0}", "2026-09-14T11:59:00Z");
        String required = reference(2).toString();
        AtomicInteger uploads = new AtomicInteger();
        OfflineSyncTransport transport = (url, token, claim) -> uploads.incrementAndGet() == 1 ? OfflineSyncTransportResult.termsRequired(required) : OfflineSyncTransportResult.success(null);
        OfflineSyncEngine engine = new OfflineSyncEngine(storage, transport, executor, () -> Instant.parse("2026-09-14T12:00:00Z"), () -> 0.5);
        assertEquals(OfflineSyncWorkerOutcome.COMPLETED, engine.runWorker("https://api.example.test", "fictitious-token", "one-time-worker"));
        assertEquals(1, uploads.get()); assertTrue(storage.hasPendingChanges());
        assertEquals("terms-required", engine.getState().getState());
        engine.runWorker("https://api.example.test", "fictitious-token", "periodic-worker");
        assertEquals(1, uploads.get());
        storage.recordTermsAccess("person-a", accepted(2));
        engine.runWorker("https://api.example.test", "fictitious-token", "one-time-worker");
        assertEquals(2, uploads.get()); assertFalse(storage.hasPendingChanges());
        engine.stop();
    }
    @Test public void doesNotApplyAnOldWorkerRequirementAfterTheAccountQueueWasRemoved() throws Exception {
        storage.recordTermsAccess("person-a", accepted(1));
        storage.putSnapshot("execution-a", "plan-a", 1, 0, "{\"revision\":0}", "2026-08-01T12:00:00Z");
        OfflineSyncClaim claim = storage.claimNextSync("2026-08-01T12:01:00Z");
        assertNotNull(claim);
        storage.clearAccountDataAtomically(); storage.bindAccount("person-b");
        assertFalse(storage.pauseSyncForTerms(claim, reference(2).toString(), "2026-08-01T12:02:00Z"));
        assertNull(storage.getTermsAccessJson("person-b"));
        assertFalse(storage.hasKnownTermsRequirement());
    }
    @Test public void classifiesOnlyTheExactTermsErrorAndValidatedReference() throws Exception {
        OfflineSyncClaim claim = new OfflineSyncClaim("execution-a", 0, "{}", 1, 0, 1, 1);
        String body = new JSONObject().put("code", "TERMS_ACCEPTANCE_REQUIRED").put("details", reference(2)).toString();
        assertEquals(OfflineSyncTransportResult.Kind.TERMS_REQUIRED, OfflineSyncHttpTransport.classify(403, body, null, claim).getKind());
        assertNotEquals(OfflineSyncTransportResult.Kind.TERMS_REQUIRED, OfflineSyncHttpTransport.classify(403, "{\"code\":\"OTHER_ERROR\"}", null, claim).getKind());
        assertEquals(OfflineSyncTransportResult.Kind.GLOBAL_BLOCKED, OfflineSyncHttpTransport.classify(403, "{\"code\":\"TERMS_ACCEPTANCE_REQUIRED\",\"details\":{}}", null, claim).getKind());
    }
}
