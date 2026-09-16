package com.dallfit.app.offline;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.annotation.SuppressLint;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.work.BackoffPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Queue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class OfflineSyncBackgroundTest {
    private static final String ENVELOPE_KEY = "dall-fit-native_session-envelope";
    private static final String SECURE_PREFERENCES = "WSSecureStorageSharedPreferences";

    private Context context;
    private String databaseName;
    private String directoryName;
    private ScheduledThreadPoolExecutor executor;
    private OfflineStorageService storage;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        clearCompatibilityPreference();
        String suffix = Long.toString(System.nanoTime());
        databaseName = "offline-background-" + suffix + ".db";
        directoryName = "offline-background-" + suffix;
        storage = new OfflineStorageService(context, databaseName, directoryName);
        storage.initialize();
        storage.bindAccount("person-a");
        executor = new ScheduledThreadPoolExecutor(1);
    }

    @After
    public void tearDown() throws Exception {
        executor.shutdownNow();
        storage.close();
        context.deleteDatabase(databaseName);
        java.io.File directory = new java.io.File(context.getFilesDir(), directoryName);
        deleteRecursively(directory);
        context.getSharedPreferences(SECURE_PREFERENCES, Context.MODE_PRIVATE).edit().clear().commit();
        clearCompatibilityPreference();
        KeyStore keyStore = keyStore();
        if (keyStore.containsAlias(ENVELOPE_KEY)) keyStore.deleteEntry(ENVELOPE_KEY);
    }

    @Test
    public void workerPassUsesTheExistingEngineAndRequestsExternalRetry() {
        QueueTransport transport = new QueueTransport();
        transport.results.add(OfflineSyncTransportResult.temporary("network", null));
        OfflineSyncEngine engine = new OfflineSyncEngine(
            storage,
            transport,
            executor,
            () -> Instant.parse("2026-09-14T12:00:00Z"),
            () -> 0.5
        );
        storage.putSnapshot(
            "execution-a",
            "plan-a",
            1,
            0,
            "{\"executionId\":\"execution-a\",\"revision\":0}",
            "2026-09-14T11:59:00Z"
        );

        OfflineSyncWorkerOutcome outcome = engine.runWorker(
            "https://api.example.test",
            "fictitious-token",
            "one-time-worker"
        );

        assertEquals(OfflineSyncWorkerOutcome.RETRY, outcome);
        assertEquals(1, transport.uploadCount);
        assertTrue(storage.hasPendingChanges());
    }

    @Test
    public void authenticationStopsWithoutRemovingTheSnapshot() {
        QueueTransport transport = new QueueTransport();
        transport.results.add(
            OfflineSyncTransportResult.of(
                OfflineSyncTransportResult.Kind.AUTHENTICATION_REQUIRED,
                "authentication-required"
            )
        );
        OfflineSyncEngine engine = new OfflineSyncEngine(
            storage,
            transport,
            executor,
            () -> Instant.parse("2026-09-14T12:00:00Z"),
            () -> 0.5
        );
        storage.putSnapshot(
            "execution-a",
            "plan-a",
            1,
            0,
            "{\"executionId\":\"execution-a\",\"revision\":0}",
            "2026-09-14T11:59:00Z"
        );

        OfflineSyncWorkerOutcome outcome = engine.runWorker(
            "https://api.example.test",
            "fictitious-token",
            "periodic-worker"
        );

        assertEquals(OfflineSyncWorkerOutcome.AUTHENTICATION_REQUIRED, outcome);
        assertEquals("authentication-required", engine.getState().getState());
        assertTrue(storage.hasPendingChanges());
    }

    @Test
    public void simultaneousWorkerTriggersShareTheGlobalEngineLock() throws Exception {
        BlockingTransport transport = new BlockingTransport();
        OfflineSyncEngine engine = new OfflineSyncEngine(
            storage,
            transport,
            executor,
            () -> Instant.parse("2026-09-14T12:00:00Z"),
            () -> 0.5
        );
        storage.putSnapshot(
            "execution-a",
            "plan-a",
            1,
            0,
            "{\"executionId\":\"execution-a\",\"revision\":0}",
            "2026-09-14T11:59:00Z"
        );
        AtomicReference<OfflineSyncWorkerOutcome> firstOutcome = new AtomicReference<>();
        Thread firstWorker = new Thread(() ->
            firstOutcome.set(
                engine.runWorker(
                    "https://api.example.test",
                    "fictitious-token",
                    "one-time-worker"
                )
            )
        );

        firstWorker.start();
        assertTrue(transport.uploadStarted.await(5, TimeUnit.SECONDS));
        OfflineSyncWorkerOutcome secondOutcome = engine.runWorker(
            "https://api.example.test",
            "fictitious-token",
            "periodic-worker"
        );

        assertEquals(OfflineSyncWorkerOutcome.COMPLETED, secondOutcome);
        assertEquals(1, transport.uploadCount.get());
        transport.releaseUpload.countDown();
        firstWorker.join(5_000);
        assertFalse(firstWorker.isAlive());
        assertEquals(OfflineSyncWorkerOutcome.COMPLETED, firstOutcome.get());
    }

    @Test
    public void updateRequiredStopsWorkerAndForegroundUntilCompatibilityReturns() throws Exception {
        AppCompatibilityManager compatibility = new AppCompatibilityManager(context);
        long installedVersionCode = compatibility.getState().getInstalledVersionCode();
        compatibility.applyPolicy(
            installedVersionCode,
            2,
            "https://play.google.com/store/apps/details?id=com.dallfit.app"
        );
        QueueTransport transport = new QueueTransport();
        OfflineSyncEngine engine = new OfflineSyncEngine(
            storage,
            transport,
            executor,
            () -> Instant.parse("2026-09-14T12:00:00Z"),
            () -> 0.5
        );
        storage.putSnapshot(
            "execution-a",
            "plan-a",
            1,
            0,
            "{\"executionId\":\"execution-a\",\"revision\":0}",
            "2026-09-14T11:59:00Z"
        );

        assertEquals(
            OfflineSyncWorkerOutcome.COMPLETED,
            engine.runWorker(
                "https://api.example.test",
                "fictitious-token",
                "one-time-worker"
            )
        );
        assertEquals(0, transport.uploadCount);
        assertTrue(storage.hasPendingChanges());

        transport.results.add(OfflineSyncTransportResult.of(
            OfflineSyncTransportResult.Kind.SUCCESS,
            "synced"
        ));
        compatibility.applyPolicy(
            installedVersionCode,
            1,
            "https://play.google.com/store/apps/details?id=com.dallfit.app"
        );
        engine.onCompatibilityChanged();

        assertTrue(transport.uploaded.await(5, TimeUnit.SECONDS));
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (storage.hasPendingChanges() && System.nanoTime() < deadline) {
            Thread.sleep(10);
        }
        assertEquals(1, transport.uploadCount);
        assertFalse(storage.hasPendingChanges());
    }

    @Test
    @SuppressLint("RestrictedApi")
    public void workRequestsUseOnlyConnectedConstraintAndExpectedBackoff() {
        OneTimeWorkRequest oneTime = OfflineSyncWorkScheduler.oneTimeRequest();
        PeriodicWorkRequest periodic = OfflineSyncWorkScheduler.periodicRequest();

        assertEquals(NetworkType.CONNECTED, oneTime.getWorkSpec().constraints.getRequiredNetworkType());
        assertFalse(oneTime.getWorkSpec().constraints.requiresCharging());
        assertFalse(oneTime.getWorkSpec().constraints.requiresBatteryNotLow());
        assertFalse(oneTime.getWorkSpec().constraints.requiresDeviceIdle());
        assertEquals(BackoffPolicy.EXPONENTIAL, oneTime.getWorkSpec().backoffPolicy);
        assertEquals(30_000L, oneTime.getWorkSpec().backoffDelayDuration);
        assertEquals(6L * 60L * 60L * 1_000L, periodic.getWorkSpec().intervalDuration);
        assertEquals(NetworkType.CONNECTED, periodic.getWorkSpec().constraints.getRequiredNetworkType());
    }

    @Test
    public void readsAndClearsTheExistingEncryptedEnvelope() throws Exception {
        writeEnvelope(Instant.now().plusSeconds(3600).toString());
        NativeSyncSessionStore store = new NativeSyncSessionStore(context);

        NativeSyncSession session = store.readSession();

        assertEquals("fictitious-token", session.getAccessToken());
        assertEquals("person-a", session.getPersonId());
        store.clearEnvelope();
        assertNull(store.readSession());
    }

    @Test
    public void expiredEnvelopeFailsClosedAndIsRemoved() throws Exception {
        writeEnvelope(Instant.now().minusSeconds(1).toString());
        NativeSyncSessionStore store = new NativeSyncSessionStore(context);

        assertNull(store.readSession());
        assertFalse(
            context
                .getSharedPreferences(SECURE_PREFERENCES, Context.MODE_PRIVATE)
                .contains(ENVELOPE_KEY)
        );
    }

    private void writeEnvelope(String expiresAt) throws Exception {
        JSONObject envelope = new JSONObject();
        envelope.put("version", 1);
        envelope.put("accessToken", "fictitious-token");
        envelope.put("expiresAt", expiresAt);
        envelope.put("personId", "person-a");
        String encrypted = encrypt(envelope.toString());
        context
            .getSharedPreferences(SECURE_PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putString(ENVELOPE_KEY, encrypted)
            .commit();
    }

    private static String encrypt(String value) throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
        generator.init(
            new KeyGenParameterSpec.Builder(
                ENVELOPE_KEY,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        );
        SecretKey key = generator.generateKey();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        int flags = Base64.NO_PADDING + Base64.NO_WRAP;
        return (
            Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), flags) +
            '\u0010' +
            Base64.encodeToString(cipher.getIV(), flags)
        );
    }

    private static KeyStore keyStore() throws Exception {
        KeyStore result = KeyStore.getInstance("AndroidKeyStore");
        result.load(null);
        return result;
    }

    private void clearCompatibilityPreference() {
        context.getSharedPreferences("app-compatibility", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit();
    }

    private static void deleteRecursively(java.io.File target) {
        if (!target.exists()) return;
        java.io.File[] children = target.listFiles();
        if (children != null) for (java.io.File child : children) deleteRecursively(child);
        target.delete();
    }

    private static final class QueueTransport implements OfflineSyncTransport {
        private final Queue<OfflineSyncTransportResult> results = new ArrayDeque<>();
        private final CountDownLatch uploaded = new CountDownLatch(1);
        private int uploadCount;

        @Override
        public OfflineSyncTransportResult upload(
            String apiBaseUrl,
            String accessToken,
            OfflineSyncClaim claim
        ) {
            uploadCount++;
            uploaded.countDown();
            OfflineSyncTransportResult result = results.poll();
            if (result == null) throw new AssertionError("Missing transport result.");
            return result;
        }
    }

    private static final class BlockingTransport implements OfflineSyncTransport {
        private final CountDownLatch releaseUpload = new CountDownLatch(1);
        private final AtomicInteger uploadCount = new AtomicInteger();
        private final CountDownLatch uploadStarted = new CountDownLatch(1);

        @Override
        public OfflineSyncTransportResult upload(
            String apiBaseUrl,
            String accessToken,
            OfflineSyncClaim claim
        ) {
            uploadCount.incrementAndGet();
            uploadStarted.countDown();
            try {
                if (!releaseUpload.await(5, TimeUnit.SECONDS)) {
                    throw new AssertionError("Timed out waiting to release upload.");
                }
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new AssertionError("Interrupted while waiting to release upload.", error);
            }
            return OfflineSyncTransportResult.of(
                OfflineSyncTransportResult.Kind.SUCCESS,
                "synced"
            );
        }
    }
}
