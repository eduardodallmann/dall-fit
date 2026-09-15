package com.dallfit.app.offline;

import android.content.Context;
import android.util.Log;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class OfflineSyncWorkScheduler {
    static final String ONE_TIME_WORK_NAME = "dall-fit-offline-sync";
    static final String PERIODIC_WORK_NAME = "dall-fit-offline-sync-contingency";
    private static final String LOG_TAG = "DallFitOfflineSync";
    private static final long BACKOFF_SECONDS = 30;
    private static final long PERIODIC_HOURS = 6;

    private final AtomicBoolean started = new AtomicBoolean();
    private final WorkManager workManager;
    private final OfflineStorageService.SnapshotListener snapshotListener = this::enqueueOneTime;

    public OfflineSyncWorkScheduler(Context context) {
        workManager = WorkManager.getInstance(context.getApplicationContext());
    }

    public void cancelOneTime() {
        workManager.cancelUniqueWork(ONE_TIME_WORK_NAME);
        Log.i(
            LOG_TAG,
            "OfflineSyncWorkScheduler -> cancelOneTime -> completed: category=one-time-worker"
        );
    }

    public void enqueueOneTime() {
        workManager.enqueueUniqueWork(
            ONE_TIME_WORK_NAME,
            ExistingWorkPolicy.KEEP,
            oneTimeRequest()
        );
        Log.i(
            LOG_TAG,
            "OfflineSyncWorkScheduler -> enqueueOneTime -> scheduled: category=one-time-worker"
        );
    }

    public void start(OfflineStorageService storage) {
        if (!started.compareAndSet(false, true)) return;
        storage.addSnapshotListener(snapshotListener);
        try {
            workManager.enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                periodicRequest()
            );
        } catch (RuntimeException error) {
            storage.removeSnapshotListener(snapshotListener);
            started.set(false);
            throw error;
        }
        Log.i(
            LOG_TAG,
            "OfflineSyncWorkScheduler -> start -> contingency scheduled: category=periodic-worker"
        );
    }

    private static Constraints networkConstraints() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    static OneTimeWorkRequest oneTimeRequest() {
        return new OneTimeWorkRequest.Builder(OfflineSyncWorker.class)
            .setConstraints(networkConstraints())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
            .addTag(ONE_TIME_WORK_NAME)
            .build();
    }

    static PeriodicWorkRequest periodicRequest() {
        return new PeriodicWorkRequest.Builder(
            OfflineSyncWorker.class,
            PERIODIC_HOURS,
            TimeUnit.HOURS
        )
            .setConstraints(networkConstraints())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
            .addTag(PERIODIC_WORK_NAME)
            .build();
    }
}
