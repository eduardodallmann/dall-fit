package com.dallfit.app.offline;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONException;
import org.json.JSONObject;

public final class OfflineSyncHttpTransport implements OfflineSyncTransport {
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int MAX_RESPONSE_BYTES = 1_100_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final Set<String> SUCCESS_STATES = new HashSet<>(Arrays.asList(
        "accepted",
        "duplicate",
        "completed",
        "duplicate-completed",
        "cancelled",
        "duplicate-cancelled",
        "resolved-local",
        "resolved-server"
    ));

    @Override
    public OfflineSyncTransportResult upload(
        String apiBaseUrl,
        String accessToken,
        OfflineSyncClaim claim
    ) {
        HttpURLConnection connection = null;
        try {
            URL endpoint = endpoint(apiBaseUrl);
            connection = (HttpURLConnection) endpoint.openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("PUT");
            connection.setRequestProperty("accept", "application/json");
            connection.setRequestProperty("authorization", "Bearer " + accessToken);
            connection.setRequestProperty("content-type", "application/json; charset=utf-8");
            connection.setUseCaches(false);
            connection.setDoOutput(true);
            byte[] body = claim.getPayloadJson().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body);
            }
            int status = connection.getResponseCode();
            String responseBody = readBody(connection, status);
            String retryAfter = connection.getHeaderField("Retry-After");
            return classify(status, responseBody, retryAfter, claim);
        } catch (IOException | RuntimeException error) {
            return OfflineSyncTransportResult.temporary("network", null);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    static OfflineSyncTransportResult classify(
        int status,
        String responseBody,
        String retryAfter,
        OfflineSyncClaim claim
    ) {
        JSONObject response = parseObject(responseBody);
        if (status == HttpURLConnection.HTTP_OK) {
            if (response == null) return OfflineSyncTransportResult.of(
                OfflineSyncTransportResult.Kind.BLOCKED,
                "invalid-response"
            );
            JSONObject data = response.optJSONObject("data");
            if (
                data == null ||
                !claim.getExecutionId().equals(data.optString("executionId")) ||
                !matchesAcceptedRevision(claim, data) ||
                !SUCCESS_STATES.contains(data.optString("state"))
            ) return OfflineSyncTransportResult.of(
                OfflineSyncTransportResult.Kind.BLOCKED,
                "invalid-response"
            );
            JSONObject completion = data.optJSONObject("completion");
            return OfflineSyncTransportResult.success(
                completion == null ? null : completion.toString()
            );
        }

        String code = response == null ? "HTTP_" + status : response.optString("code", "HTTP_" + status);
        if (status == HttpURLConnection.HTTP_UNAUTHORIZED || "NATIVE_SESSION_REQUIRED".equals(code)) {
            return OfflineSyncTransportResult.of(
                OfflineSyncTransportResult.Kind.AUTHENTICATION_REQUIRED,
                "authentication-required"
            );
        }
        if (status == 426 || "UPDATE_REQUIRED".equals(code)) {
            return OfflineSyncTransportResult.of(
                OfflineSyncTransportResult.Kind.UPDATE_REQUIRED,
                "update-required"
            );
        }
        if ("AUTH_TRANSPORT_AMBIGUOUS".equals(code)) {
            return OfflineSyncTransportResult.of(
                OfflineSyncTransportResult.Kind.GLOBAL_BLOCKED,
                "auth-transport-ambiguous"
            );
        }
        if (
            "OFFLINE_TRAINING_SNAPSHOT_VERSION_CONFLICT".equals(code) ||
            "OFFLINE_TRAINING_EXECUTION_IMMUTABLE".equals(code)
        ) {
            String reason = "OFFLINE_TRAINING_EXECUTION_IMMUTABLE".equals(code)
                ? "discard-local-only"
                : "conflict";
            JSONObject details = response == null ? null : response.optJSONObject("details");
            return OfflineSyncTransportResult.action(reason, details == null ? null : details.toString());
        }
        if ("OFFLINE_TRAINING_CONFLICT_TOKEN_STALE".equals(code))
            return OfflineSyncTransportResult.action("conflict-stale", null);
        if ("OFFLINE_LEASE_REVOKED".equals(code)) {
            return OfflineSyncTransportResult.action("lease-revoked", null);
        }
        if ("OFFLINE_LEASE_EXPIRED".equals(code)) {
            return OfflineSyncTransportResult.action("lease-expired", null);
        }
        if (
            status == HttpURLConnection.HTTP_CLIENT_TIMEOUT ||
            status == 429 ||
            status >= 500 ||
            "OFFLINE_TRAINING_SYNC_IN_PROGRESS".equals(code)
        ) return OfflineSyncTransportResult.temporary(code, retryAfter);
        return OfflineSyncTransportResult.of(
            OfflineSyncTransportResult.Kind.BLOCKED,
            sanitizeReason(code)
        );
    }

    static URL endpoint(String apiBaseUrl) throws IOException {
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
            return new URI(normalized + "/training/offline-snapshot").toURL();
        } catch (URISyntaxException error) {
            throw new IOException("Invalid API base URL.", error);
        }
    }

    private static JSONObject parseObject(String value) {
        if (value == null || value.isEmpty()) return null;
        try {
            return new JSONObject(value);
        } catch (JSONException error) {
            return null;
        }
    }

    private static boolean matchesAcceptedRevision(OfflineSyncClaim claim, JSONObject data) {
        if (claim.getRevision() == data.optLong("revision", -1)) return true;
        if (!"resolved-server".equals(data.optString("state"))) return false;
        JSONObject request = parseObject(claim.getPayloadJson());
        JSONObject resolution = request == null ? null : request.optJSONObject("resolution");
        return resolution != null && "server".equals(resolution.optString("choice"));
    }

    private static String readBody(HttpURLConnection connection, int status) throws IOException {
        InputStream source = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (source == null) return "";
        try (InputStream input = source; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_RESPONSE_BYTES) throw new IOException("Response is too large.");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static String sanitizeReason(String reason) {
        return reason.matches("[A-Z0-9_]{1,100}") ? reason.toLowerCase(java.util.Locale.ROOT) : "http-error";
    }
}
