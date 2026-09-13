package com.dallfit.app.offline;

public final class OfflineFileMetadata {
    private final String contentType;
    private final String fileId;
    private final String planId;
    private final long revision;
    private final long sizeBytes;
    private final String status;
    private final String updatedAt;

    public OfflineFileMetadata(
        String fileId,
        String planId,
        String contentType,
        long revision,
        long sizeBytes,
        String status,
        String updatedAt
    ) {
        this.fileId = fileId;
        this.planId = planId;
        this.contentType = contentType;
        this.revision = revision;
        this.sizeBytes = sizeBytes;
        this.status = status;
        this.updatedAt = updatedAt;
    }

    public String getContentType() {
        return contentType;
    }

    public String getFileId() {
        return fileId;
    }

    public String getPlanId() {
        return planId;
    }

    public long getRevision() {
        return revision;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getStatus() {
        return status;
    }

    public String getUpdatedAt() {
        return updatedAt;
    }
}
