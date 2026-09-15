package com.dallfit.app.offline;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;

public final class OfflineSyncConnectivity {
    private final ConnectivityManager connectivity;
    private final OfflineSyncEngine engine;
    private boolean registered;
    private final ConnectivityManager.NetworkCallback callback = new ConnectivityManager.NetworkCallback() {
        @Override
        public void onAvailable(Network network) {
            engine.onConnectivityAvailable();
        }
    };

    public OfflineSyncConnectivity(Context context, OfflineSyncEngine engine) {
        connectivity = (ConnectivityManager) context
            .getApplicationContext()
            .getSystemService(Context.CONNECTIVITY_SERVICE);
        this.engine = engine;
    }

    public synchronized void start() {
        if (registered || connectivity == null) return;
        connectivity.registerDefaultNetworkCallback(callback);
        registered = true;
    }

    public synchronized void stop() {
        if (!registered || connectivity == null) return;
        connectivity.unregisterNetworkCallback(callback);
        registered = false;
    }
}
