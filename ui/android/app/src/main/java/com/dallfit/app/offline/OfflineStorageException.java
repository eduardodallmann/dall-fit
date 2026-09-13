package com.dallfit.app.offline;

public final class OfflineStorageException extends RuntimeException {
    private final String code;

    public OfflineStorageException(String code, String message) {
        super(message);
        this.code = code;
    }

    public OfflineStorageException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
