package com.dallfit.app.offline;

import android.util.Log;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.DoubleSupplier;
import java.util.function.Supplier;

public final class OfflineSyncEngine {
    public interface StateListener {
        void onSyncStateChanged(OfflineSyncState state);
    }

    private static final String LOG_TAG = "DallFitOfflineSync";

    private final Supplier<Instant> clock;
    private final Map<String, Integer> cycleAttempts = new HashMap<>();
    private final ScheduledExecutorService executor;
    private final List<StateListener> listeners = new CopyOnWriteArrayList<>();
    private final OfflineSyncRetryPolicy retryPolicy;
    private final OfflineActionNotifier notifier;
    private final OfflineStorageService storage;
    private final OfflineStorageService.SnapshotListener snapshotListener = this::onSnapshotPending;
    private final OfflineSyncTransport transport;
    private String accessToken;
    private String apiBaseUrl;
    private boolean authenticationRequired;
    private boolean globalProtocolFailure;
    private long generation;
    private boolean initialized;
    private boolean runAgain;
    private boolean running;
    private ScheduledFuture<?> scheduled;
    private boolean updateRequired;

    public OfflineSyncEngine(OfflineStorageService storage) {
        this(
            storage,
            new OfflineSyncHttpTransport(),
            new ScheduledThreadPoolExecutor(1),
            Instant::now,
            Math::random,
            new OfflineActionNotifier(storage.getContext())
        );
    }

    OfflineSyncEngine(
        OfflineStorageService storage,
        OfflineSyncTransport transport,
        ScheduledExecutorService executor,
        Supplier<Instant> clock,
        DoubleSupplier random
    ) {
        this(storage, transport, executor, clock, random, null);
    }

    private OfflineSyncEngine(
        OfflineStorageService storage,
        OfflineSyncTransport transport,
        ScheduledExecutorService executor,
        Supplier<Instant> clock,
        DoubleSupplier random,
        OfflineActionNotifier notifier
    ) {
        this.storage = storage;
        this.transport = transport;
        this.executor = executor;
        this.clock = clock;
        this.notifier = notifier;
        retryPolicy = new OfflineSyncRetryPolicy(clock, random);
        storage.addSnapshotListener(snapshotListener);
    }

    public void addStateListener(StateListener listener) {
        listeners.add(listener);
    }

    public void removeStateListener(StateListener listener) {
        listeners.remove(listener);
    }

    public synchronized OfflineSyncState getState() {
        return storage.getSyncState(running, authenticationRequired);
    }

    public void onConnectivityAvailable() {
        triggerCurrent(true, 0);
    }

    public void triggerCurrentCredentials() {
        triggerCurrent(false, 0);
    }

    public synchronized void stop() {
        generation++;
        accessToken = null;
        apiBaseUrl = null;
        authenticationRequired = false;
        globalProtocolFailure = false;
        updateRequired = false;
        runAgain = false;
        if (scheduled != null) scheduled.cancel(false);
        scheduled = null;
        emitState();
    }

    public void trigger(String apiBaseUrl, String accessToken, boolean rearmTemporary) {
        if (apiBaseUrl == null || apiBaseUrl.trim().isEmpty()) throw invalidInput();
        if (accessToken == null || accessToken.trim().isEmpty()) throw invalidInput();
        synchronized (this) {
            configureLocked(apiBaseUrl, accessToken, rearmTemporary);
        }
        schedule(0);
    }

    public OfflineSyncWorkerOutcome runWorker(
        String apiBaseUrl,
        String accessToken,
        String origin
    ) {
        if (apiBaseUrl == null || apiBaseUrl.trim().isEmpty()) throw invalidInput();
        if (accessToken == null || accessToken.trim().isEmpty()) throw invalidInput();
        if (!"one-time-worker".equals(origin) && !"periodic-worker".equals(origin)) {
            throw invalidInput();
        }
        long expectedGeneration;
        synchronized (this) {
            if (running) {
                runAgain = true;
                return OfflineSyncWorkerOutcome.COMPLETED;
            }
            configureLocked(apiBaseUrl, accessToken, false);
            if (scheduled != null) scheduled.cancel(false);
            scheduled = null;
            running = true;
            expectedGeneration = generation;
        }
        return drainWorker(expectedGeneration, origin);
    }

    private void onSnapshotPending() {
        synchronized (this) {
            cycleAttempts.clear();
        }
        triggerCurrent(false, 500);
    }

    private void triggerCurrent(boolean rearmTemporary, long delayMs) {
        synchronized (this) {
            if (
                accessToken == null ||
                apiBaseUrl == null ||
                authenticationRequired ||
                globalProtocolFailure ||
                updateRequired
            ) {
                emitState();
                return;
            }
            if (rearmTemporary) {
                storage.rearmTemporarySync(now());
                cycleAttempts.clear();
            }
        }
        schedule(delayMs);
    }

    private synchronized void schedule(long delayMs) {
        if (running) {
            runAgain = true;
            return;
        }
        if (scheduled != null && !scheduled.isDone()) {
            if (delayMs != 0) return;
            scheduled.cancel(false);
        }
        long expectedGeneration = generation;
        scheduled = executor.schedule(() -> drain(expectedGeneration), delayMs, TimeUnit.MILLISECONDS);
    }

    private void drain(long expectedGeneration) {
        synchronized (this) {
            scheduled = null;
            if (expectedGeneration != generation || accessToken == null || apiBaseUrl == null) return;
            if (running) {
                runAgain = true;
                return;
            }
            running = true;
        }
        Log.i(LOG_TAG, "OfflineSyncEngine -> drain -> started: category=foreground");
        emitState();
        try {
            while (isCurrent(expectedGeneration)) {
                OfflineSyncClaim claim = storage.claimNextSync(now());
                if (claim == null) break;
                String currentUrl;
                String currentToken;
                synchronized (this) {
                    currentUrl = apiBaseUrl;
                    currentToken = accessToken;
                }
                if (currentUrl == null || currentToken == null) {
                    storage.releaseSyncPending(
                        claim.getExecutionId(),
                        claim.getRevision(),
                        "authentication-required",
                        now()
                    );
                    break;
                }
                Log.i(LOG_TAG, "OfflineSyncEngine -> drain -> upload started: category=sync");
                OfflineSyncTransportResult result = transport.upload(currentUrl, currentToken, claim);
                if (!isCurrent(expectedGeneration)) break;
                if (!applyResult(claim, result)) break;
            }
        } catch (RuntimeException error) {
            Log.e(
                LOG_TAG,
                "OfflineSyncEngine -> drain -> failed: category=" + error.getClass().getSimpleName()
            );
            logRecovery(storage.recoverInterruptedSync(now()));
        } finally {
            boolean repeat;
            boolean recoverBeforeRepeat;
            synchronized (this) {
                running = false;
                recoverBeforeRepeat = expectedGeneration != generation;
                repeat = runAgain && accessToken != null && apiBaseUrl != null && !authenticationRequired && !globalProtocolFailure && !updateRequired;
                runAgain = false;
            }
            emitState();
            Log.i(LOG_TAG, "OfflineSyncEngine -> drain -> completed: category=foreground");
            if (recoverBeforeRepeat) logRecovery(storage.recoverInterruptedSync(now()));
            if (repeat) {
                schedule(0);
            }
            else scheduleEarliestRetry(expectedGeneration);
        }
    }

    private OfflineSyncWorkerOutcome drainWorker(long expectedGeneration, String origin) {
        boolean retry = false;
        Log.i(LOG_TAG, "OfflineSyncEngine -> drainWorker -> started: category=" + origin);
        emitState();
        try {
            while (isCurrent(expectedGeneration)) {
                OfflineSyncClaim claim = storage.claimNextSync(now());
                if (claim == null) break;
                String currentUrl;
                String currentToken;
                synchronized (this) {
                    currentUrl = apiBaseUrl;
                    currentToken = accessToken;
                }
                if (currentUrl == null || currentToken == null) {
                    storage.releaseSyncPending(
                        claim.getExecutionId(),
                        claim.getRevision(),
                        "authentication-required",
                        now()
                    );
                    return OfflineSyncWorkerOutcome.AUTHENTICATION_REQUIRED;
                }
                Log.i(
                    LOG_TAG,
                    "OfflineSyncEngine -> drainWorker -> upload started: category=" + origin
                );
                OfflineSyncTransportResult result = transport.upload(currentUrl, currentToken, claim);
                if (!isCurrent(expectedGeneration)) break;
                if (result.getKind() == OfflineSyncTransportResult.Kind.TEMPORARY) retry = true;
                boolean shouldContinue = applyResult(claim, result);
                if (result.getKind() == OfflineSyncTransportResult.Kind.AUTHENTICATION_REQUIRED) {
                    return OfflineSyncWorkerOutcome.AUTHENTICATION_REQUIRED;
                }
                if (!shouldContinue) break;
            }
            return retry ? OfflineSyncWorkerOutcome.RETRY : OfflineSyncWorkerOutcome.COMPLETED;
        } catch (RuntimeException error) {
            Log.e(
                LOG_TAG,
                "OfflineSyncEngine -> drainWorker -> failed: category=" +
                error.getClass().getSimpleName()
            );
            logRecovery(storage.recoverInterruptedSync(now()));
            return OfflineSyncWorkerOutcome.RETRY;
        } finally {
            boolean repeat;
            boolean recoverBeforeRepeat;
            synchronized (this) {
                running = false;
                recoverBeforeRepeat = expectedGeneration != generation;
                repeat =
                    runAgain &&
                    accessToken != null &&
                    apiBaseUrl != null &&
                    !authenticationRequired &&
                    !globalProtocolFailure &&
                    !updateRequired;
                runAgain = false;
            }
            emitState();
            Log.i(LOG_TAG, "OfflineSyncEngine -> drainWorker -> completed: category=" + origin);
            if (recoverBeforeRepeat) logRecovery(storage.recoverInterruptedSync(now()));
            if (repeat) schedule(0);
        }
    }

    private void configureLocked(
        String apiBaseUrl,
        String accessToken,
        boolean rearmTemporary
    ) {
        this.apiBaseUrl = apiBaseUrl;
        this.accessToken = accessToken;
        authenticationRequired = false;
        globalProtocolFailure = storage.hasSyncReason("auth-transport-ambiguous");
        updateRequired = storage.hasSyncReason("update-required");
        if (!initialized) {
            logRecovery(storage.recoverInterruptedSync(now()));
            initialized = true;
        } else if (!running) {
            logRecovery(storage.recoverInterruptedSync(now()));
        }
        if (rearmTemporary) {
            storage.rearmTemporarySync(now());
            cycleAttempts.clear();
        }
    }

    private boolean applyResult(OfflineSyncClaim claim, OfflineSyncTransportResult result) {
        String updatedAt = now();
        Log.i(
            LOG_TAG,
            "OfflineSyncEngine -> applyResult -> classified: category=" +
            result.getKind().name().toLowerCase(java.util.Locale.ROOT)
        );
        switch (result.getKind()) {
            case SUCCESS:
                storage.completeSync(claim, result.getDetailsJson(), updatedAt);
                clearCycleAttempt(claim);
                Log.i(LOG_TAG, "OfflineSyncEngine -> applyResult -> upload completed: category=success");
                return true;
            case TEMPORARY:
                int attempts = claim.getAttemptCount() + 1;
                String attemptKey = claim.getExecutionId() + ":" + claim.getRevision();
                int attemptsInCycle;
                synchronized (this) {
                    attemptsInCycle = cycleAttempts.getOrDefault(attemptKey, 0) + 1;
                    cycleAttempts.put(attemptKey, attemptsInCycle);
                }
                long delay = retryPolicy.delayMs(attemptsInCycle, result.getRetryAfter());
                String nextAttemptAt = retryPolicy.mayRetry(attemptsInCycle)
                    ? clock.get().plusMillis(delay).toString()
                    : null;
                storage.markSyncRetry(
                    claim.getExecutionId(),
                    claim.getRevision(),
                    attempts,
                    nextAttemptAt,
                    result.getReason(),
                    updatedAt
                );
                Log.i(
                    LOG_TAG,
                    "OfflineSyncEngine -> applyResult -> retry scheduled: category=temporary, attempt=" +
                    attemptsInCycle
                );
                return retryPolicy.mayRetry(attemptsInCycle);
            case AUTHENTICATION_REQUIRED:
                storage.releaseSyncPending(
                    claim.getExecutionId(),
                    claim.getRevision(),
                    result.getReason(),
                    updatedAt
                );
                synchronized (this) {
                    accessToken = null;
                    authenticationRequired = true;
                }
                clearCycleAttempt(claim);
                if (notifier != null) notifier.notifyActionRequired();
                return false;
            case UPDATE_REQUIRED:
                storage.markSyncActionRequired(
                    claim.getExecutionId(),
                    claim.getRevision(),
                    result.getReason(),
                    result.getDetailsJson(),
                    updatedAt
                );
                synchronized (this) {
                    updateRequired = true;
                }
                clearCycleAttempt(claim);
                return false;
            case ACTION_REQUIRED:
                if ("conflict-stale".equals(result.getReason())) {
                    storage.reopenStaleConflict(claim, updatedAt);
                    clearCycleAttempt(claim);
                    return true;
                }
                storage.markSyncActionRequired(
                    claim.getExecutionId(),
                    claim.getRevision(),
                    result.getReason(),
                    result.getDetailsJson(),
                    updatedAt
                );
                clearCycleAttempt(claim);
                if (notifier != null && "conflict".equals(result.getReason()))
                    notifier.notifyActionRequired();
                return true;
            case BLOCKED:
                storage.markSyncBlocked(
                    claim.getExecutionId(),
                    claim.getRevision(),
                    result.getReason(),
                    updatedAt
                );
                clearCycleAttempt(claim);
                return true;
            case GLOBAL_BLOCKED:
                storage.markSyncBlocked(
                    claim.getExecutionId(),
                    claim.getRevision(),
                    result.getReason(),
                    updatedAt
                );
                synchronized (this) {
                    globalProtocolFailure = true;
                }
                clearCycleAttempt(claim);
                return false;
            default:
                throw new IllegalStateException("Unknown sync result.");
        }
    }

    private void scheduleEarliestRetry(long expectedGeneration) {
        if (!isCurrent(expectedGeneration)) return;
        String next = storage.earliestRetryAt();
        if (next == null) return;
        long delay;
        try {
            delay = Math.max(0, Instant.parse(next).toEpochMilli() - clock.get().toEpochMilli());
        } catch (DateTimeParseException error) {
            delay = 0;
        }
        schedule(delay);
    }

    private synchronized boolean isCurrent(long expectedGeneration) {
        return expectedGeneration == generation && !authenticationRequired && !globalProtocolFailure && !updateRequired;
    }

    private String now() {
        return clock.get().toString();
    }

    private void clearCycleAttempt(OfflineSyncClaim claim) {
        synchronized (this) {
            cycleAttempts.remove(claim.getExecutionId() + ":" + claim.getRevision());
        }
    }

    private static void logRecovery(int recoveredCount) {
        if (recoveredCount == 0) return;
        Log.i(
            LOG_TAG,
            "OfflineSyncEngine -> trigger -> claims recovered: category=interrupted, count=" +
            recoveredCount
        );
    }

    private void emitState() {
        OfflineSyncState state;
        try {
            state = getState();
        } catch (RuntimeException error) {
            return;
        }
        for (StateListener listener : listeners) {
            try {
                listener.onSyncStateChanged(state);
            } catch (RuntimeException error) {
                Log.e(
                    LOG_TAG,
                    "OfflineSyncEngine -> emitState -> listener failed: category=" +
                    error.getClass().getSimpleName()
                );
            }
        }
    }

    private static OfflineStorageException invalidInput() {
        return new OfflineStorageException(
            "OFFLINE_SYNC_INVALID_INPUT",
            "Offline synchronization input is invalid."
        );
    }
}
