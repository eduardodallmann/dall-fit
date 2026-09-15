package com.dallfit.app.offline;

import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.function.DoubleSupplier;
import java.util.function.Supplier;

final class OfflineSyncRetryPolicy {
    private static final long BASE_RETRY_MS = 1_000;
    private static final long MAX_RETRY_AFTER_MS = 15 * 60 * 1_000;
    private static final long MAX_RETRY_MS = 60_000;
    private static final int MAX_RUN_ATTEMPTS = 5;

    private final Supplier<Instant> clock;
    private final DoubleSupplier random;

    OfflineSyncRetryPolicy(Supplier<Instant> clock, DoubleSupplier random) {
        this.clock = clock;
        this.random = random;
    }

    long delayMs(int attempt, String retryAfter) {
        Long headerDelay = parseRetryAfter(retryAfter);
        if (headerDelay != null) return headerDelay;
        long exponential = Math.min(
            MAX_RETRY_MS,
            BASE_RETRY_MS * (1L << Math.min(attempt - 1, 16))
        );
        double factor = 0.5 + random.getAsDouble();
        return Math.max(BASE_RETRY_MS / 2, Math.round(exponential * factor));
    }

    boolean mayRetry(int attemptsInCycle) {
        return attemptsInCycle < MAX_RUN_ATTEMPTS;
    }

    private Long parseRetryAfter(String value) {
        if (value == null || value.trim().isEmpty()) return null;
        try {
            long seconds = Long.parseLong(value.trim());
            return clampRetryAfter(Math.multiplyExact(seconds, 1_000));
        } catch (NumberFormatException | ArithmeticException ignored) {
            try {
                Instant date = ZonedDateTime.parse(
                    value.trim(),
                    DateTimeFormatter.RFC_1123_DATE_TIME
                ).toInstant();
                return clampRetryAfter(date.toEpochMilli() - clock.get().toEpochMilli());
            } catch (DateTimeParseException invalidDate) {
                return null;
            }
        }
    }

    private static long clampRetryAfter(long value) {
        return Math.max(1_000, Math.min(MAX_RETRY_AFTER_MS, value));
    }
}
