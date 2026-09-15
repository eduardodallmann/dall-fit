package com.dallfit.app.offline;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.time.Instant;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

public final class NativeSyncSessionStore {
    private static final String ANDROID_KEY_STORE = "AndroidKeyStore";
    private static final int BASE64_FLAGS = Base64.NO_PADDING + Base64.NO_WRAP;
    private static final String CIPHER_TRANSFORMATION = "AES/GCM/NoPadding";
    private static final String DATA_IV_SEPARATOR = "\u0010";
    private static final String ENVELOPE_KEY = "dall-fit-native_session-envelope";
    private static final int ENVELOPE_VERSION = 1;
    private static final String SECURE_PREFERENCES = "WSSecureStorageSharedPreferences";
    private static final String SYNC_CONFIGURATION_PREFERENCES = "dall-fit-native-sync";
    private static final String API_BASE_URL_KEY = "api-base-url";

    private final Context context;

    public NativeSyncSessionStore(Context context) {
        this.context = context.getApplicationContext();
    }

    public synchronized void clearEnvelope() {
        try {
            KeyStore keyStore = keyStore();
            if (keyStore.containsAlias(ENVELOPE_KEY)) keyStore.deleteEntry(ENVELOPE_KEY);
        } catch (Exception ignored) {
            // The preference is still removed below so an unreadable token cannot be reused.
        }
        securePreferences().edit().remove(ENVELOPE_KEY).commit();
    }

    public synchronized String readApiBaseUrl() {
        try {
            String value = configurationPreferences().getString(API_BASE_URL_KEY, null);
            if (value == null) return null;
            OfflineSyncHttpTransport.endpoint(value);
            return value;
        } catch (Exception error) {
            configurationPreferences().edit().remove(API_BASE_URL_KEY).apply();
            return null;
        }
    }

    public synchronized NativeSyncSession readSession() {
        try {
            String encrypted = securePreferences().getString(ENVELOPE_KEY, null);
            if (encrypted == null) return null;
            String serialized = decrypt(encrypted);
            JSONObject envelope = new JSONObject(serialized);
            if (
                envelope.length() != 4 ||
                envelope.optInt("version", -1) != ENVELOPE_VERSION ||
                !envelope.has("accessToken") ||
                !envelope.has("expiresAt") ||
                !envelope.has("personId")
            ) throw new IllegalArgumentException("Invalid native session envelope.");
            String accessToken = envelope.optString("accessToken", "");
            String expiresAt = envelope.optString("expiresAt", "");
            String personId = envelope.optString("personId", "");
            if (
                accessToken.isEmpty() ||
                personId.isEmpty() ||
                !Instant.parse(expiresAt).isAfter(Instant.now())
            ) throw new IllegalArgumentException("Expired native session envelope.");
            return new NativeSyncSession(accessToken, personId);
        } catch (Exception error) {
            clearEnvelope();
            return null;
        }
    }

    public synchronized void writeApiBaseUrl(String apiBaseUrl) {
        try {
            OfflineSyncHttpTransport.endpoint(apiBaseUrl);
        } catch (Exception error) {
            throw new OfflineStorageException(
                "OFFLINE_SYNC_INVALID_INPUT",
                "Offline synchronization input is invalid."
            );
        }
        if (!configurationPreferences().edit().putString(API_BASE_URL_KEY, apiBaseUrl).commit()) {
            throw new OfflineStorageException(
                "OFFLINE_SYNC_CONFIGURATION_FAILED",
                "Offline synchronization configuration could not be stored."
            );
        }
    }

    private SharedPreferences configurationPreferences() {
        return context.getSharedPreferences(SYNC_CONFIGURATION_PREFERENCES, Context.MODE_PRIVATE);
    }

    private String decrypt(String encrypted) throws Exception {
        String[] parts = encrypted.split(DATA_IV_SEPARATOR, -1);
        if (parts.length != 2) throw new IllegalArgumentException("Invalid encrypted envelope.");
        KeyStore.SecretKeyEntry entry = (KeyStore.SecretKeyEntry) keyStore().getEntry(ENVELOPE_KEY, null);
        if (entry == null) throw new IllegalArgumentException("Missing envelope key.");
        SecretKey secretKey = entry.getSecretKey();
        Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
        byte[] iv = Base64.decode(parts[1], BASE64_FLAGS);
        cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(128, iv));
        byte[] plaintext = cipher.doFinal(Base64.decode(parts[0], BASE64_FLAGS));
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    private KeyStore keyStore() throws Exception {
        KeyStore result = KeyStore.getInstance(ANDROID_KEY_STORE);
        result.load(null);
        return result;
    }

    private SharedPreferences securePreferences() {
        return context.getSharedPreferences(SECURE_PREFERENCES, Context.MODE_PRIVATE);
    }
}
