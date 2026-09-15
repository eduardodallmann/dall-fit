package com.dallfit.app.offline;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public final class OfflineSyncWorker extends Worker {
    private static final int MAX_RECOVERABLE_ATTEMPTS = 5;
    private static final String LOG_TAG = "DallFitOfflineSync";

    public OfflineSyncWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull
    @Override
    public Result doWork() {
        String category = getTags().contains(OfflineSyncWorkScheduler.PERIODIC_WORK_NAME)
            ? "periodic-worker"
            : "one-time-worker";
        Log.i(LOG_TAG, "OfflineSyncWorker -> doWork -> started: category=" + category);
        try {
            OfflineStorageProvider.initializeBackground(getApplicationContext());
            NativeSyncSessionStore sessionStore = OfflineStorageProvider.getSessionStore(
                getApplicationContext()
            );
            NativeSyncSession session = sessionStore.readSession();
            String apiBaseUrl = sessionStore.readApiBaseUrl();
            if (session == null || apiBaseUrl == null) return complete(category, "configuration");
            try {
                OfflineStorageProvider.get(getApplicationContext()).bindAccount(session.getPersonId());
            } catch (OfflineStorageException error) {
                if ("OFFLINE_STORAGE_ACCOUNT_MISMATCH".equals(error.getCode())) {
                    return complete(category, "account-mismatch");
                }
                throw error;
            }

            OfflineSyncWorkerOutcome outcome = OfflineStorageProvider.getSyncEngine(
                getApplicationContext()
            ).runWorker(apiBaseUrl, session.getAccessToken(), category);
            if (outcome == OfflineSyncWorkerOutcome.AUTHENTICATION_REQUIRED) {
                sessionStore.clearEnvelope();
                return complete(category, "authentication-required");
            }
            if (outcome == OfflineSyncWorkerOutcome.RETRY && getRunAttemptCount() < MAX_RECOVERABLE_ATTEMPTS) {
                Log.i(LOG_TAG, "OfflineSyncWorker -> doWork -> retry: category=" + category);
                return Result.retry();
            }
            return complete(category, outcome.name().toLowerCase(java.util.Locale.ROOT));
        } catch (RuntimeException error) {
            Log.e(
                LOG_TAG,
                "OfflineSyncWorker -> doWork -> failed: category=" + error.getClass().getSimpleName()
            );
            if (getRunAttemptCount() < MAX_RECOVERABLE_ATTEMPTS) return Result.retry();
            return Result.success();
        }
    }

    private static Result complete(String category, String outcome) {
        Log.i(
            LOG_TAG,
            "OfflineSyncWorker -> doWork -> completed: category=" + category + ", outcome=" + outcome
        );
        return Result.success();
    }
}
