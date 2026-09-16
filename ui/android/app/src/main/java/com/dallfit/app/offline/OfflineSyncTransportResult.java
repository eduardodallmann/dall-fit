package com.dallfit.app.offline;

public final class OfflineSyncTransportResult {
    public enum Kind {
        ACTION_REQUIRED,
        AUTHENTICATION_REQUIRED,
        BLOCKED,
        GLOBAL_BLOCKED,
        SUCCESS,
        TEMPORARY,
        UPDATE_REQUIRED
    }

    private final String detailsJson;
    private final Kind kind;
    private final String reason;
    private final String retryAfter;

    private OfflineSyncTransportResult(
        Kind kind,
        String reason,
        String detailsJson,
        String retryAfter
    ) {
        this.kind = kind;
        this.reason = reason;
        this.detailsJson = detailsJson;
        this.retryAfter = retryAfter;
    }

    public static OfflineSyncTransportResult of(Kind kind, String reason) {
        return new OfflineSyncTransportResult(kind, reason, null, null);
    }

    public static OfflineSyncTransportResult action(String reason, String detailsJson) {
        return new OfflineSyncTransportResult(Kind.ACTION_REQUIRED, reason, detailsJson, null);
    }

    public static OfflineSyncTransportResult success(String completionJson) {
        return new OfflineSyncTransportResult(Kind.SUCCESS, "accepted", completionJson, null);
    }

    public static OfflineSyncTransportResult temporary(String reason, String retryAfter) {
        return new OfflineSyncTransportResult(Kind.TEMPORARY, reason, null, retryAfter);
    }

    public static OfflineSyncTransportResult updateRequired(String detailsJson) {
        return new OfflineSyncTransportResult(
            Kind.UPDATE_REQUIRED,
            "update-required",
            detailsJson,
            null
        );
    }

    public String getDetailsJson() {
        return detailsJson;
    }

    public Kind getKind() {
        return kind;
    }

    public String getReason() {
        return reason;
    }

    public String getRetryAfter() {
        return retryAfter;
    }
}
