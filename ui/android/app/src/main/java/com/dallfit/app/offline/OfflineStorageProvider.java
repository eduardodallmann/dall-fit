package com.dallfit.app.offline;

import android.content.Context;

public final class OfflineStorageProvider {
    private static volatile OfflineStorageService instance;

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
}
