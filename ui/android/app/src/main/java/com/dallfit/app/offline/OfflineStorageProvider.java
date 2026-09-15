package com.dallfit.app.offline;

import android.content.Context;

public final class OfflineStorageProvider {
    private static volatile OfflineStorageService instance;
    private static volatile OfflineSyncWorkScheduler scheduler;
    private static volatile NativeSyncSessionStore sessionStore;
    private static volatile OfflineSyncEngine syncEngine;

    private OfflineStorageProvider() {}

    public static OfflineStorageService get(Context context) {
        OfflineStorageService current = instance;
        if (current != null) return current;
        synchronized (OfflineStorageProvider.class) {
            if (instance == null) {
                instance = new OfflineStorageService(context.getApplicationContext());
            }
            return instance;
        }
    }

    public static OfflineSyncEngine getSyncEngine(Context context) {
        OfflineSyncEngine current = syncEngine;
        if (current != null) return current;
        synchronized (OfflineStorageProvider.class) {
            if (syncEngine == null) syncEngine = new OfflineSyncEngine(get(context));
            return syncEngine;
        }
    }

    public static OfflineSyncWorkScheduler getScheduler(Context context) {
        OfflineSyncWorkScheduler current = scheduler;
        if (current != null) return current;
        synchronized (OfflineStorageProvider.class) {
            if (scheduler == null) scheduler = new OfflineSyncWorkScheduler(context);
            return scheduler;
        }
    }

    public static NativeSyncSessionStore getSessionStore(Context context) {
        NativeSyncSessionStore current = sessionStore;
        if (current != null) return current;
        synchronized (OfflineStorageProvider.class) {
            if (sessionStore == null) sessionStore = new NativeSyncSessionStore(context);
            return sessionStore;
        }
    }

    public static void initializeBackground(Context context) {
        getScheduler(context).start(get(context));
    }
}
