package com.dallfit.app;

import com.dallfit.app.offline.OfflineFileMetadata;
import com.dallfit.app.offline.OfflineStorageException;
import com.dallfit.app.offline.OfflineStorageProvider;
import com.dallfit.app.offline.OfflineStorageService;
import com.dallfit.app.offline.OfflineStorageState;
import com.dallfit.app.offline.StoredAggregate;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;
import org.json.JSONException;

@CapacitorPlugin(name = "OfflineStorage")
public final class OfflineStoragePlugin extends Plugin {
    private interface PluginWork {
        JSObject run() throws JSONException;
    }

    private OfflineStorageService service;
    private final OfflineStorageService.StateListener stateListener = state ->
        execute(() -> notifyListeners("stateChanged", stateToJson(state)));

    @Override
    public void load() {
        service = OfflineStorageProvider.get(getContext());
        service.addStateListener(stateListener);
    }

    @Override
    protected void handleOnDestroy() {
        if (service != null) service.removeStateListener(stateListener);
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        resolve(call, () -> stateToJson(service.initialize()));
    }

    @PluginMethod
    public void getState(PluginCall call) {
        resolve(call, () -> stateToJson(service.getState()));
    }

    @PluginMethod
    public void bindAccount(PluginCall call) {
        resolve(call, () -> {
            service.bindAccount(requiredString(call, "personId"));
            return new JSObject();
        });
    }

    @PluginMethod
    public void hasPendingChanges(PluginCall call) {
        resolve(call, () -> {
            JSObject result = new JSObject();
            result.put("value", service.hasPendingChanges());
            return result;
        });
    }

    @PluginMethod
    public void clearAccountData(PluginCall call) {
        resolve(call, () -> {
            service.clearAccountDataAtomically();
            return new JSObject();
        });
    }

    @PluginMethod
    public void getPreparedPlan(PluginCall call) {
        resolveAggregate(call, service::getPreparedPlan);
    }

    @PluginMethod
    public void putPreparedPlan(PluginCall call) {
        resolve(call, () -> {
            service.putPreparedPlan(
                requiredString(call, "planId"),
                requiredInteger(call, "payloadVersion"),
                requiredLong(call, "revision"),
                requiredObject(call, "payload").toString(),
                requiredString(call, "validatedAt"),
                requiredString(call, "expiresAt"),
                call.getString("expectedPlanId"),
                optionalLong(call, "expectedRevision")
            );
            return new JSObject();
        });
    }

    @PluginMethod
    public void removePreparedPlan(PluginCall call) {
        resolveRemoved(
            call,
            () -> service.removePreparedPlan(
                requiredString(call, "planId"),
                requiredLong(call, "expectedRevision")
            )
        );
    }

    @PluginMethod
    public void getActiveSession(PluginCall call) {
        resolveAggregate(call, service::getActiveSession);
    }

    @PluginMethod
    public void putActiveSession(PluginCall call) {
        resolve(call, () -> {
            service.putActiveSession(
                requiredString(call, "sessionId"),
                requiredString(call, "planId"),
                requiredInteger(call, "payloadVersion"),
                requiredLong(call, "revision"),
                requiredObject(call, "payload").toString(),
                requiredString(call, "updatedAt")
            );
            return new JSObject();
        });
    }

    @PluginMethod
    public void removeActiveSession(PluginCall call) {
        resolveRemoved(
            call,
            () -> service.removeActiveSession(
                requiredString(call, "sessionId"),
                requiredLong(call, "expectedRevision")
            )
        );
    }

    @PluginMethod
    public void getSnapshot(PluginCall call) {
        resolveAggregate(call, () -> service.getSnapshot(requiredString(call, "executionId")));
    }

    @PluginMethod
    public void listSnapshots(PluginCall call) {
        resolve(call, () -> {
            List<StoredAggregate> snapshots = service.listSnapshots();
            JSArray array = new JSArray();
            for (StoredAggregate snapshot : snapshots) array.put(aggregateToJson(snapshot));
            JSObject result = new JSObject();
            result.put("aggregates", array);
            return result;
        });
    }

    @PluginMethod
    public void putSnapshot(PluginCall call) {
        resolve(call, () -> {
            service.putSnapshot(
                requiredString(call, "executionId"),
                requiredString(call, "planId"),
                requiredInteger(call, "payloadVersion"),
                requiredLong(call, "revision"),
                requiredObject(call, "payload").toString(),
                requiredString(call, "updatedAt")
            );
            return new JSObject();
        });
    }

    @PluginMethod
    public void removeSnapshot(PluginCall call) {
        resolveRemoved(
            call,
            () -> service.removeSnapshot(
                requiredString(call, "executionId"),
                requiredLong(call, "expectedRevision")
            )
        );
    }

    @PluginMethod
    public void registerTemporaryFile(PluginCall call) {
        resolve(call, () -> {
            OfflineFileMetadata file = service.registerTemporaryFile(
                requiredString(call, "fileId"),
                call.getString("planId"),
                requiredString(call, "contentType"),
                requiredLong(call, "revision"),
                requiredString(call, "updatedAt"),
                optionalLong(call, "expectedRevision")
            );
            JSObject result = new JSObject();
            result.put("file", fileToJson(file));
            return result;
        });
    }

    @PluginMethod
    public void completeFile(PluginCall call) {
        resolve(call, () -> {
            OfflineFileMetadata file = service.completeFile(
                requiredString(call, "fileId"),
                requiredLong(call, "expectedRevision"),
                requiredString(call, "updatedAt")
            );
            JSObject result = new JSObject();
            result.put("file", fileToJson(file));
            return result;
        });
    }

    @PluginMethod
    public void getFile(PluginCall call) {
        resolve(call, () -> {
            OfflineFileMetadata file = service.getFile(requiredString(call, "fileId"));
            JSObject result = new JSObject();
            if (file != null) result.put("file", fileToJson(file));
            return result;
        });
    }

    @PluginMethod
    public void removeFile(PluginCall call) {
        resolveRemoved(
            call,
            () -> service.removeFile(
                requiredString(call, "fileId"),
                requiredLong(call, "expectedRevision")
            )
        );
    }

    private interface BooleanWork {
        boolean run();
    }

    private void resolveRemoved(PluginCall call, BooleanWork work) {
        resolve(call, () -> {
            JSObject result = new JSObject();
            result.put("removed", work.run());
            return result;
        });
    }

    private interface AggregateWork {
        StoredAggregate run();
    }

    private void resolveAggregate(PluginCall call, AggregateWork work) {
        resolve(call, () -> {
            StoredAggregate aggregate = work.run();
            JSObject result = new JSObject();
            if (aggregate != null) result.put("aggregate", aggregateToJson(aggregate));
            return result;
        });
    }

    private void resolve(PluginCall call, PluginWork work) {
        try {
            call.resolve(work.run());
        } catch (OfflineStorageException error) {
            call.reject(error.getMessage(), error.getCode());
        } catch (JSONException error) {
            call.reject("Offline storage response could not be encoded.", "OFFLINE_STORAGE_ENCODING_FAILED");
        } catch (RuntimeException error) {
            call.reject("Offline storage operation failed.", "OFFLINE_STORAGE_OPERATION_FAILED");
        }
    }

    private static String requiredString(PluginCall call, String name) {
        String value = call.getString(name);
        if (value == null || value.trim().isEmpty()) throw invalidInput();
        return value;
    }

    private static int requiredInteger(PluginCall call, String name) {
        Integer value = call.getInt(name);
        if (value == null) throw invalidInput();
        return value;
    }

    private static long requiredLong(PluginCall call, String name) {
        Long value = optionalLong(call, name);
        if (value == null) throw invalidInput();
        return value;
    }

    private static Long optionalLong(PluginCall call, String name) {
        Object value = call.getData().opt(name);
        if (value == null) return null;
        if (!(value instanceof Number number)) throw invalidInput();
        double doubleValue = number.doubleValue();
        long longValue = number.longValue();
        if (!Double.isFinite(doubleValue) || doubleValue != longValue) throw invalidInput();
        return longValue;
    }

    private static JSObject requiredObject(PluginCall call, String name) {
        JSObject value = call.getObject(name);
        if (value == null) throw invalidInput();
        return value;
    }

    private static OfflineStorageException invalidInput() {
        return new OfflineStorageException("OFFLINE_STORAGE_INVALID_INPUT", "Offline storage input is invalid.");
    }

    private static JSObject stateToJson(OfflineStorageState state) {
        JSObject result = new JSObject();
        result.put("revision", state.getRevision());
        result.put("resetGeneration", state.getResetGeneration());
        result.put("recovery", state.getRecovery());
        result.put("accountBound", state.isAccountBound());
        result.put("initialized", state.isInitialized());
        result.put("preparedPlanAvailable", state.isPreparedPlanAvailable());
        result.put("sessionAvailable", state.isSessionAvailable());
        result.put("pendingSnapshotCount", state.getPendingSnapshotCount());
        result.put("temporaryFileCount", state.getTemporaryFileCount());
        result.put("readyFileCount", state.getReadyFileCount());
        return result;
    }

    private static JSObject aggregateToJson(StoredAggregate aggregate) throws JSONException {
        JSObject result = new JSObject();
        result.put("id", aggregate.getId());
        result.put("planId", aggregate.getPlanId());
        result.put("payloadVersion", aggregate.getPayloadVersion());
        result.put("revision", aggregate.getRevision());
        result.put("payload", new JSObject(aggregate.getPayloadJson()));
        result.put("updatedAt", aggregate.getUpdatedAt());
        return result;
    }

    private static JSObject fileToJson(OfflineFileMetadata file) {
        JSObject result = new JSObject();
        result.put("fileId", file.getFileId());
        if (file.getPlanId() != null) result.put("planId", file.getPlanId());
        result.put("contentType", file.getContentType());
        result.put("revision", file.getRevision());
        result.put("sizeBytes", file.getSizeBytes());
        result.put("status", file.getStatus());
        result.put("updatedAt", file.getUpdatedAt());
        return result;
    }
}
