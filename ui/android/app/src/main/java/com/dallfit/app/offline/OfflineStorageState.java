package com.dallfit.app.offline;

public final class OfflineStorageState {
    private final boolean accountBound;
    private final int pendingSnapshotCount;
    private final boolean preparedPlanAvailable;
    private final String recovery;
    private final long resetGeneration;
    private final int readyFileCount;
    private final long revision;
    private final boolean sessionAvailable;
    private final int temporaryFileCount;

    public OfflineStorageState(
        long revision,
        long resetGeneration,
        String recovery,
        boolean accountBound,
        boolean preparedPlanAvailable,
        boolean sessionAvailable,
        int pendingSnapshotCount,
        int temporaryFileCount,
        int readyFileCount
    ) {
        this.revision = revision;
        this.resetGeneration = resetGeneration;
        this.recovery = recovery;
        this.accountBound = accountBound;
        this.preparedPlanAvailable = preparedPlanAvailable;
        this.sessionAvailable = sessionAvailable;
        this.pendingSnapshotCount = pendingSnapshotCount;
        this.temporaryFileCount = temporaryFileCount;
        this.readyFileCount = readyFileCount;
    }

    public boolean isAccountBound() {
        return accountBound;
    }

    public boolean isInitialized() {
        return true;
    }

    public int getPendingSnapshotCount() {
        return pendingSnapshotCount;
    }

    public boolean isPreparedPlanAvailable() {
        return preparedPlanAvailable;
    }

    public String getRecovery() {
        return recovery;
    }

    public long getResetGeneration() {
        return resetGeneration;
    }

    public int getReadyFileCount() {
        return readyFileCount;
    }

    public long getRevision() {
        return revision;
    }

    public boolean isSessionAvailable() {
        return sessionAvailable;
    }

    public int getTemporaryFileCount() {
        return temporaryFileCount;
    }
}
