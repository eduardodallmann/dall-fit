package com.dallfit.app.offline;

public final class AppCompatibilityState {
    private final long installedVersionCode;
    private final String installedVersionName;
    private final Long minimumVersionCode;
    private final String storeUrl;
    private final boolean updateRequired;

    AppCompatibilityState(
        long installedVersionCode,
        String installedVersionName,
        Long minimumVersionCode,
        String storeUrl,
        boolean updateRequired
    ) {
        this.installedVersionCode = installedVersionCode;
        this.installedVersionName = installedVersionName;
        this.minimumVersionCode = minimumVersionCode;
        this.storeUrl = storeUrl;
        this.updateRequired = updateRequired;
    }

    public long getInstalledVersionCode() { return installedVersionCode; }
    public String getInstalledVersionName() { return installedVersionName; }
    public Long getMinimumVersionCode() { return minimumVersionCode; }
    public String getStoreUrl() { return storeUrl; }
    public boolean isUpdateRequired() { return updateRequired; }
}
