package com.dallfit.app.offline;

public final class OfflineSyncAction {
    private final String executionId;
    private final long revision;
    private final String reason;
    private final String snapshotJson;
    private final String detailsJson;

    public OfflineSyncAction(
        String executionId,
        long revision,
        String reason,
        String snapshotJson,
        String detailsJson
    ) {
        this.executionId = executionId;
        this.revision = revision;
        this.reason = reason;
        this.snapshotJson = snapshotJson;
        this.detailsJson = detailsJson;
    }

    public String getExecutionId() { return executionId; }
    public long getRevision() { return revision; }
    public String getReason() { return reason; }
    public String getSnapshotJson() { return snapshotJson; }
    public String getDetailsJson() { return detailsJson; }
}
