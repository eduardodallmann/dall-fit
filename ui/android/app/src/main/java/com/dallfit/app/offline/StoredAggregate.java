package com.dallfit.app.offline;

public final class StoredAggregate {
    private final String id;
    private final String payloadJson;
    private final int payloadVersion;
    private final String planId;
    private final long revision;
    private final String updatedAt;

    public StoredAggregate(
        String id,
        String planId,
        int payloadVersion,
        long revision,
        String payloadJson,
        String updatedAt
    ) {
        this.id = id;
        this.planId = planId;
        this.payloadVersion = payloadVersion;
        this.revision = revision;
        this.payloadJson = payloadJson;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public String getPayloadJson() {
        return payloadJson;
    }

    public int getPayloadVersion() {
        return payloadVersion;
    }

    public String getPlanId() {
        return planId;
    }

    public long getRevision() {
        return revision;
    }

    public String getUpdatedAt() {
        return updatedAt;
    }
}
