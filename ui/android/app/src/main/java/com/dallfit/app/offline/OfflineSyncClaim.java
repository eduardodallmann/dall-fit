package com.dallfit.app.offline;

public final class OfflineSyncClaim {
    private final int attemptCount;
    private final String executionId;
    private final String payloadJson;
    private final long queueSequence;
    private final long revision;

    OfflineSyncClaim(
        String executionId,
        long revision,
        String payloadJson,
        long queueSequence,
        int attemptCount
    ) {
        this.executionId = executionId;
        this.revision = revision;
        this.payloadJson = payloadJson;
        this.queueSequence = queueSequence;
        this.attemptCount = attemptCount;
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
}
