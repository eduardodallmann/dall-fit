package com.dallfit.app;

import android.app.Application;
import android.util.Log;
import com.dallfit.app.offline.OfflineStorageProvider;

public final class DallFitApplication extends Application {
    private static final String LOG_TAG = "DallFitOfflineSync";

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            OfflineStorageProvider.initializeBackground(this);
            Log.i(
                LOG_TAG,
                "DallFitApplication -> onCreate -> background sync initialized: category=application"
            );
        } catch (RuntimeException error) {
            Log.e(
                LOG_TAG,
                "DallFitApplication -> onCreate -> background sync failed: category=" +
                error.getClass().getSimpleName()
            );
        }
    }
}
