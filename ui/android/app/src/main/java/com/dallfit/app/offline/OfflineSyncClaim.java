package com.dallfit.app.offline;

public final class OfflineSyncClaim {
    private final int attemptCount;
    private final String executionId;
    private final String payloadJson;
    private final long appVersionCode;
    private final long queueSequence;
    private final long revision;
    private final int syncContractVersion;

    OfflineSyncClaim(
        String executionId,
        long revision,
        String payloadJson,
        long queueSequence,
        int attemptCount,
        long appVersionCode,
        int syncContractVersion
    ) {
        this.executionId = executionId;
        this.revision = revision;
        this.payloadJson = payloadJson;
        this.queueSequence = queueSequence;
        this.attemptCount = attemptCount;
        this.appVersionCode = appVersionCode;
        this.syncContractVersion = syncContractVersion;
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public String getExecutionId() {
        return executionId;
    }

    public String getPayloadJson() {
        return payloadJson;
    }

    public long getQueueSequence() {
        return queueSequence;
    }

    public long getRevision() {
        return revision;
    }

    public long getAppVersionCode() {
        return appVersionCode;
    }

    public int getSyncContractVersion() {
        return syncContractVersion;
    }
}
