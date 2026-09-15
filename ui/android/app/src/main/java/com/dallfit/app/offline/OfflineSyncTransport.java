package com.dallfit.app.offline;

public interface OfflineSyncTransport {
    OfflineSyncTransportResult upload(
        String apiBaseUrl,
        String accessToken,
        OfflineSyncClaim claim
    );
}
