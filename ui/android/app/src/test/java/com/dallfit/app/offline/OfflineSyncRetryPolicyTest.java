package com.dallfit.app.offline;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.time.Instant;
import org.junit.Test;

public final class OfflineSyncRetryPolicyTest {
    private static final Instant NOW = Instant.parse("2026-09-14T12:00:00Z");

    @Test
    public void appliesExponentialBackoffJitterAndCeiling() {
        OfflineSyncRetryPolicy exact = new OfflineSyncRetryPolicy(() -> NOW, () -> 0.5);
        OfflineSyncRetryPolicy minimum = new OfflineSyncRetryPolicy(() -> NOW, () -> 0.0);
        OfflineSyncRetryPolicy maximum = new OfflineSyncRetryPolicy(() -> NOW, () -> 1.0);

        assertEquals(1_000, exact.delayMs(1, null));
        assertEquals(2_000, exact.delayMs(2, null));
        assertEquals(60_000, exact.delayMs(8, null));
        assertEquals(500, minimum.delayMs(1, null));
        assertEquals(1_500, maximum.delayMs(1, null));
    }

    @Test
    public void prefersAndClampsBothRetryAfterFormats() {
        OfflineSyncRetryPolicy policy = new OfflineSyncRetryPolicy(() -> NOW, () -> 0.5);

        assertEquals(120_000, policy.delayMs(1, "120"));
        assertEquals(900_000, policy.delayMs(1, "99999"));
        assertEquals(60_000, policy.delayMs(1, "Mon, 14 Sep 2026 12:01:00 GMT"));
        assertEquals(1_000, policy.delayMs(1, "Mon, 14 Sep 2026 11:00:00 GMT"));
        assertEquals(1_000, policy.delayMs(1, "invalid"));
    }

    @Test
    public void limitsOneAutomaticCycleToFiveAttempts() {
        OfflineSyncRetryPolicy policy = new OfflineSyncRetryPolicy(() -> NOW, () -> 0.5);

        assertTrue(policy.mayRetry(4));
        assertFalse(policy.mayRetry(5));
    }
}
