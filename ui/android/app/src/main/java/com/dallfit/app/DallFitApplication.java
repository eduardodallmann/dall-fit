package com.dallfit.app;

import android.app.Application;
import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import com.dallfit.app.offline.OfflineStorageProvider;

public final class DallFitApplication extends Application {
    private static final String LOG_TAG = "DallFitOfflineSync";
    private static int visibleActivities;

    public static boolean isAppVisible() {
        return visibleActivities > 0;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override public void onActivityStarted(Activity activity) { visibleActivities++; }
            @Override public void onActivityStopped(Activity activity) {
                visibleActivities = Math.max(0, visibleActivities - 1);
            }
            @Override public void onActivityCreated(Activity activity, Bundle state) {}
            @Override public void onActivityResumed(Activity activity) {}
            @Override public void onActivityPaused(Activity activity) {}
            @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
            @Override public void onActivityDestroyed(Activity activity) {}
        });
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
