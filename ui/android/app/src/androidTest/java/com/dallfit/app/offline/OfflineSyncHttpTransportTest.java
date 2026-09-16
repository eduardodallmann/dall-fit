package com.dallfit.app.offline;

import static org.junit.Assert.assertEquals;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class OfflineSyncHttpTransportTest {
    private static final OfflineSyncClaim CLAIM = new OfflineSyncClaim(
        "execution-a",
        3,
        "{\"executionId\":\"execution-a\",\"revision\":3}",
        1,
        0,
        1,
        1
    );

    @Test
    public void acceptsOnlyMatchingKnownSuccessResponses() {
        assertEquals(
            OfflineSyncTransportResult.Kind.SUCCESS,
            classify(200, "{\"data\":{\"executionId\":\"execution-a\",\"revision\":3,\"state\":\"accepted\"}}").getKind()
        );
        assertEquals(
            OfflineSyncTransportResult.Kind.BLOCKED,
            classify(200, "{\"data\":{\"executionId\":\"execution-a\",\"revision\":4,\"state\":\"accepted\"}}").getKind()
        );
        assertEquals(
            OfflineSyncTransportResult.Kind.BLOCKED,
            classify(200, "not-json").getKind()
        );
    }

    @Test
    public void classifiesAuthenticationProtocolConflictAndTemporaryErrors() {
        assertEquals(
            OfflineSyncTransportResult.Kind.AUTHENTICATION_REQUIRED,
            classify(401, "{\"code\":\"AUTHENTICATION_REQUIRED\"}").getKind()
        );
        assertEquals(
            OfflineSyncTransportResult.Kind.AUTHENTICATION_REQUIRED,
            classify(403, "{\"code\":\"NATIVE_SESSION_REQUIRED\"}").getKind()
        );
        assertEquals(
            OfflineSyncTransportResult.Kind.GLOBAL_BLOCKED,
            classify(400, "{\"code\":\"AUTH_TRANSPORT_AMBIGUOUS\"}").getKind()
        );
        assertEquals(
            OfflineSyncTransportResult.Kind.ACTION_REQUIRED,
            classify(
                409,
                "{\"code\":\"OFFLINE_TRAINING_SNAPSHOT_VERSION_CONFLICT\",\"details\":{\"allowedResolution\":\"local-or-server\"}}"
            ).getKind()
        );
        assertEquals(
            OfflineSyncTransportResult.Kind.UPDATE_REQUIRED,
            classify(
                409,
                "{\"code\":\"APP_UPDATE_REQUIRED\",\"details\":{" +
                "\"minimumVersionCode\":1,\"syncContractVersion\":2," +
                "\"storeUrl\":\"https://play.google.com/store/apps/details?id=com.dallfit.app\"}}"
            ).getKind()
        );
        assertEquals(
            OfflineSyncTransportResult.Kind.UPDATE_REQUIRED,
            classify(
                409,
                "{\"code\":\"APP_UPDATE_REQUIRED\",\"details\":{" +
                "\"minimumVersionCode\":2,\"syncContractVersion\":1," +
                "\"storeUrl\":\"https://play.google.com/store/apps/details?id=com.dallfit.app\"}}"
            ).getKind()
        );
        assertEquals(
            OfflineSyncTransportResult.Kind.BLOCKED,
            classify(
                409,
                "{\"code\":\"APP_UPDATE_REQUIRED\",\"details\":{" +
                "\"minimumVersionCode\":2,\"syncContractVersion\":1," +
                "\"storeUrl\":\"https://play.google.com/store/apps/detailsevil?id=com.dallfit.app\"}}"
            ).getKind()
        );
        assertEquals(
            OfflineSyncTransportResult.Kind.TEMPORARY,
            classify(503, "{\"code\":\"SERVICE_UNAVAILABLE\"}").getKind()
        );
    }

    @Test
    public void acceptsCanonicalServerRevisionOnlyForAnExplicitServerResolution() {
        OfflineSyncClaim resolution = new OfflineSyncClaim(
            "execution-a",
            3,
            "{\"executionId\":\"execution-a\",\"revision\":3," +
            "\"resolution\":{\"choice\":\"server\",\"conflictToken\":\"opaque\"}}",
            1,
            0,
            1,
            1
        );

        assertEquals(
            OfflineSyncTransportResult.Kind.SUCCESS,
            OfflineSyncHttpTransport.classify(
                200,
                "{\"data\":{\"executionId\":\"execution-a\",\"revision\":7,\"state\":\"resolved-server\"}}",
                null,
                resolution
            ).getKind()
        );
    }

    private static OfflineSyncTransportResult classify(int status, String body) {
        return OfflineSyncHttpTransport.classify(status, body, null, CLAIM);
    }
}
