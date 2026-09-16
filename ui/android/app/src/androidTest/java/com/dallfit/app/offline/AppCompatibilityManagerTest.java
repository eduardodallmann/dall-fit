package com.dallfit.app.offline;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class AppCompatibilityManagerTest {
    private Context context;
    private AppCompatibilityManager manager;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        context.getSharedPreferences("app-compatibility", Context.MODE_PRIVATE).edit().clear().commit();
        manager = new AppCompatibilityManager(context);
    }

    @After
    public void tearDown() {
        context.getSharedPreferences("app-compatibility", Context.MODE_PRIVATE).edit().clear().commit();
    }

    @Test
    public void readsTheInstalledPackageAndPersistsTheLargestObservedMinimum() {
        AppCompatibilityState initial = manager.getState();
        assertTrue(initial.getInstalledVersionCode() > 0);
        assertFalse(initial.isUpdateRequired());

        AppCompatibilityState blocked = manager.applyPolicy(
            initial.getInstalledVersionCode() + 1,
            1,
            "https://play.google.com/store/apps/details?id=com.dallfit.app"
        );
        assertTrue(blocked.isUpdateRequired());

        AppCompatibilityState monotonic = manager.applyPolicy(
            1,
            1,
            "https://play.google.com/store/apps/details?id=com.dallfit.app"
        );
        assertEquals(blocked.getMinimumVersionCode(), monotonic.getMinimumVersionCode());
        assertTrue(monotonic.isUpdateRequired());
    }

    @Test
    public void blocksARequiredSyncContractThatTheInstalledBuildDoesNotSupport() {
        AppCompatibilityState state = manager.applyPolicy(
            1,
            2,
            "https://play.google.com/store/apps/details?id=com.dallfit.app"
        );

        assertTrue(state.isUpdateRequired());
    }
}
