package com.dallfit.app.offline;

public final class StoredAggregate {
    private final String id;
    private final String payloadJson;
    private final int payloadVersion;
    private final String planId;
    private final long revision;
    private final String updatedAt;
    private final String validatedAt;
    private final String expiresAt;

    public StoredAggregate(
        String id,
        String planId,
        int payloadVersion,
        long revision,
        String payloadJson,
        String updatedAt
    ) {
        this(id, planId, payloadVersion, revision, payloadJson, updatedAt, null, null);
    }

    public StoredAggregate(
        String id,
        String planId,
        int payloadVersion,
        long revision,
        String payloadJson,
        String updatedAt,
        String validatedAt,
        String expiresAt
    ) {
        this.id = id;
        this.planId = planId;
        this.payloadVersion = payloadVersion;
        this.revision = revision;
        this.payloadJson = payloadJson;
        this.updatedAt = updatedAt;
        this.validatedAt = validatedAt;
        this.expiresAt = expiresAt;
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

    public String getValidatedAt() {
        return validatedAt;
    }

    public String getExpiresAt() {
        return expiresAt;
    }
}
