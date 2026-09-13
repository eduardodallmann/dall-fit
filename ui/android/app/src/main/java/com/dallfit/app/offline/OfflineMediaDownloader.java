package com.dallfit.app.offline;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.time.Instant;
import java.util.Locale;

public final class OfflineMediaDownloader {
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int MAX_REDIRECTS = 3;
    private static final long MAX_BYTES = 10L * 1024L * 1024L;

    private final OfflineStorageService storage;

    public OfflineMediaDownloader(OfflineStorageService storage) {
        this.storage = storage;
    }

    public OfflineFileMetadata download(
        String url,
        String fileId,
        String planId,
        String contentType,
        long revision,
        long expectedPlanRevision
    ) {
        if (!"image/webp".equals(contentType)) throw invalidResponse();
        String updatedAt = Instant.now().toString();
        storage.registerTemporaryFileForPreparedPlan(
            fileId,
            planId,
            contentType,
            revision,
            updatedAt,
            expectedPlanRevision
        );
        try {
            File target = storage.getTemporaryFileForNativeWrite(fileId);
            transfer(url, target);
            OfflineFileMetadata result = storage.completeFileForPreparedPlan(
                fileId,
                revision,
                Instant.now().toString(),
                planId,
                expectedPlanRevision
            );
            return result;
        } catch (RuntimeException | IOException error) {
            cleanupTemporary(fileId, revision);
            if (error instanceof OfflineStorageException storageError) throw storageError;
            throw new OfflineStorageException("OFFLINE_MEDIA_DOWNLOAD_FAILED", "Offline media could not be downloaded.");
        }
    }

    private void transfer(String initialUrl, File target) throws IOException {
        URL current = requireHttps(initialUrl);
        for (int redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
            HttpURLConnection connection = (HttpURLConnection) current.openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("GET");
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "image/webp");
            connection.setRequestProperty("Cookie", "");
            connection.setRequestProperty("Cookie2", "");
            try {
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    if (redirects == MAX_REDIRECTS) throw invalidResponse();
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw invalidResponse();
                    current = requireHttps(current.toURI().resolve(location).toString());
                    continue;
                }
                if (status < 200 || status >= 300) throw invalidResponse();
                String responseType = connection.getContentType();
                if (responseType == null || !responseType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT).equals("image/webp")) {
                    throw invalidResponse();
                }
                long declaredLength = connection.getContentLengthLong();
                if (declaredLength > MAX_BYTES) throw invalidResponse();
                writeBody(connection, target, declaredLength);
                return;
            } catch (java.net.URISyntaxException error) {
                throw new IOException(error);
            } finally {
                connection.disconnect();
            }
        }
    }

    private void writeBody(HttpURLConnection connection, File target, long declaredLength) throws IOException {
        long total = 0;
        byte[] buffer = new byte[16 * 1024];
        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(target, false)) {
            int count;
            while ((count = input.read(buffer)) != -1) {
                total += count;
                if (total > MAX_BYTES) throw invalidResponse();
                output.write(buffer, 0, count);
            }
            if (total == 0 || (declaredLength >= 0 && total != declaredLength)) throw invalidResponse();
            output.flush();
            output.getFD().sync();
        }
    }

    private URL requireHttps(String rawUrl) throws IOException {
        try {
            URI uri = URI.create(rawUrl);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) throw invalidResponse();
            return uri.toURL();
        } catch (IllegalArgumentException error) {
            throw new IOException(error);
        }
    }

    private void cleanupTemporary(String fileId, long revision) {
        try {
            OfflineFileMetadata file = storage.getFile(fileId);
            if (file != null && "temporary".equals(file.getStatus()) && file.getRevision() == revision) {
                storage.removeFile(fileId, revision);
            }
        } catch (RuntimeException ignored) {
            // Recovery on the next initialization remains authoritative.
        }
    }

    private static OfflineStorageException invalidResponse() {
        return new OfflineStorageException("OFFLINE_MEDIA_INVALID_RESPONSE", "Offline media response is invalid.");
    }
}
