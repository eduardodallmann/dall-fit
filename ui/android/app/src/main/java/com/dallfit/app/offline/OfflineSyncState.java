package com.dallfit.app.offline;

public final class OfflineSyncState {
    private final boolean actionRequired;
    private final int pendingCount;
    private final long revision;
    private final String state;

    public OfflineSyncState(long revision, String state, int pendingCount, boolean actionRequired) {
        this.revision = revision;
        this.state = state;
        this.pendingCount = pendingCount;
        this.actionRequired = actionRequired;
    }

    public boolean isActionRequired() {
        return actionRequired;
    }

    public int getPendingCount() {
        return pendingCount;
    }

    public long getRevision() {
        return revision;
    }

    public String getState() {
        return state;
    }
}
