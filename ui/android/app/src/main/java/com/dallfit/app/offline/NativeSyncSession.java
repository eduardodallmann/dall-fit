package com.dallfit.app.offline;

public final class NativeSyncSession {
    private final String accessToken;
    private final String personId;

    NativeSyncSession(String accessToken, String personId) {
        this.accessToken = accessToken;
        this.personId = personId;
    }

    public String getAccessToken() {
        return accessToken;
    }

    public String getPersonId() {
        return personId;
    }
}
