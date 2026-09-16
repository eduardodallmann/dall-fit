package com.dallfit.app.offline;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONObject;

public final class AppCompatibilityManager {
    public static final int SYNC_CONTRACT_VERSION = 1;
    private static final int MAX_RESPONSE_BYTES = 16_384;
    private static final String PACKAGE_NAME = "com.dallfit.app";
    private static final String PLAY_STORE_PACKAGE = "com.android.vending";
    private static final String PREFERENCES = "app-compatibility";
    private static final String KEY_MINIMUM_VERSION = "minimum-version-code";
    private static final String KEY_REQUIRED_SYNC_CONTRACT = "required-sync-contract-version";
    private static final String KEY_STORE_URL = "store-url";
    private static final String LOG_TAG = "DallFitCompatibility";

    private final Context context;
    private final SharedPreferences preferences;

    public AppCompatibilityManager(Context context) {
        this.context = context.getApplicationContext();
        preferences = this.context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    public synchronized AppCompatibilityState getState() {
        PackageInfo packageInfo = packageInfo();
        long minimum = preferences.getLong(KEY_MINIMUM_VERSION, 0);
        int requiredContract = preferences.getInt(KEY_REQUIRED_SYNC_CONTRACT, 0);
        String storeUrl = preferences.getString(KEY_STORE_URL, null);
        AppCompatibilityState result = new AppCompatibilityState(
            packageInfo.getLongVersionCode(),
            packageInfo.versionName == null ? "" : packageInfo.versionName,
            minimum == 0 ? null : minimum,
            storeUrl,
            minimum > packageInfo.getLongVersionCode() ||
            (requiredContract > 0 && requiredContract != SYNC_CONTRACT_VERSION)
        );
        return result;
    }

    public AppCompatibilityState check(String apiBaseUrl) {
        Log.i(LOG_TAG, "AppCompatibilityManager -> check -> started: category=policy");
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) endpoint(apiBaseUrl).openConnection();
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(15_000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("accept", "application/json");
            connection.setUseCaches(false);
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) throw new IOException("Policy unavailable.");
            JSONObject response = new JSONObject(readBody(connection));
            JSONObject data = response.optJSONObject("data");
            if (data == null || !"android".equals(data.optString("platform"))) {
                throw new IOException("Policy response invalid.");
            }
            AppCompatibilityState result = applyPolicy(
                data.optLong("minimumVersionCode", 0),
                data.optInt("syncContractVersion", 0),
                data.optString("storeUrl", "")
            );
            Log.i(
                LOG_TAG,
                "AppCompatibilityManager -> check -> completed: category=" +
                (result.isUpdateRequired() ? "update-required" : "compatible")
            );
            return result;
        } catch (IOException | JSONException | RuntimeException error) {
            Log.i(LOG_TAG, "AppCompatibilityManager -> check -> failed: category=unavailable");
            return getState();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    public synchronized AppCompatibilityState applyPolicy(
        long minimumVersionCode,
        int syncContractVersion,
        String storeUrl
    ) {
        if (
            minimumVersionCode <= 0 ||
            syncContractVersion <= 0 ||
            !validStoreUrl(storeUrl)
        ) throw invalidPolicy();
        long observed = Math.max(
            minimumVersionCode,
            preferences.getLong(KEY_MINIMUM_VERSION, 0)
        );
        SharedPreferences.Editor editor = preferences.edit()
            .putLong(KEY_MINIMUM_VERSION, observed)
            .putInt(KEY_REQUIRED_SYNC_CONTRACT, syncContractVersion)
            .putString(KEY_STORE_URL, storeUrl);
        if (!editor.commit()) throw invalidPolicy();
        AppCompatibilityState result = getState();
        return result;
    }

    public AppCompatibilityState recordUpdateRequired(String detailsJson) {
        try {
            JSONObject details = new JSONObject(detailsJson == null ? "" : detailsJson);
            AppCompatibilityState result = applyPolicy(
                details.optLong("minimumVersionCode", 0),
                details.optInt("syncContractVersion", 0),
                details.optString("storeUrl", "")
            );
            return result;
        } catch (JSONException error) {
            throw invalidPolicy();
        }
    }

    public synchronized boolean openStore(String requestedUrl) {
        AppCompatibilityState state = getState();
        String storeUrl = state.getStoreUrl();
        if (storeUrl == null || !storeUrl.equals(requestedUrl) || !validStoreUrl(storeUrl)) {
            throw invalidPolicy();
        }
        Intent playStore = new Intent(Intent.ACTION_VIEW, Uri.parse(storeUrl));
        playStore.setPackage(PLAY_STORE_PACKAGE);
        playStore.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(playStore);
            return true;
        } catch (ActivityNotFoundException | SecurityException unavailable) {
            Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse(storeUrl));
            browser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                context.startActivity(browser);
                return true;
            } catch (ActivityNotFoundException | SecurityException terminal) {
                return false;
            }
        }
    }

    private PackageInfo packageInfo() {
        try {
            return context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
        } catch (PackageManager.NameNotFoundException error) {
            throw new OfflineStorageException(
                "APP_PACKAGE_INFO_UNAVAILABLE",
                "Application package information is unavailable.",
                error
            );
        }
    }

    private static URL endpoint(String apiBaseUrl) throws IOException {
        try {
            URI base = new URI(apiBaseUrl);
            String scheme = base.getScheme();
            String host = base.getHost();
            boolean local = "localhost".equals(host) || "127.0.0.1".equals(host) || "10.0.2.2".equals(host);
            if (host == null || (!("https".equals(scheme)) && !("http".equals(scheme) && local))) {
                throw new IOException("Invalid API base URL.");
            }
            String normalized = apiBaseUrl.endsWith("/")
                ? apiBaseUrl.substring(0, apiBaseUrl.length() - 1)
                : apiBaseUrl;
            return new URI(normalized + "/app-compatibility/android").toURL();
        } catch (URISyntaxException error) {
            throw new IOException("Invalid API base URL.", error);
        }
    }

    private static String readBody(HttpURLConnection connection) throws IOException {
        try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[2048];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_RESPONSE_BYTES) throw new IOException("Policy response too large.");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    static boolean validStoreUrl(String value) {
        try {
            URI uri = new URI(value);
            String query = uri.getRawQuery();
            return "https".equals(uri.getScheme()) &&
                "play.google.com".equals(uri.getHost()) &&
                "/store/apps/details".equals(uri.getPath()) &&
                query != null &&
                java.util.Arrays.asList(query.split("&")).contains("id=" + PACKAGE_NAME);
        } catch (URISyntaxException error) {
            return false;
        }
    }

    private static OfflineStorageException invalidPolicy() {
        return new OfflineStorageException(
            "APP_COMPATIBILITY_POLICY_INVALID",
            "Application compatibility policy is invalid."
        );
    }
}
