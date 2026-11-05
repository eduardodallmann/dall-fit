package com.dallfit.app.offline;

import java.time.Instant;
import org.json.JSONException;
import org.json.JSONObject;

final class TermsAccessValidator {
    private TermsAccessValidator() {}

    static JSONObject reference(JSONObject value) throws JSONException {
        if (value == null || !value.optString("id").matches("[a-fA-F0-9]{24}") ||
            !value.optString("contentHash").matches("[a-f0-9]{64}") ||
            !(value.opt("publicationNumber") instanceof Number) ||
            value.optDouble("publicationNumber") != value.optLong("publicationNumber") ||
            value.optLong("publicationNumber") < 1 || value.optLong("publicationNumber") > 9007199254740991L) {
            throw new JSONException("Invalid terms reference.");
        }
        JSONObject result = new JSONObject();
        result.put("id", value.getString("id"));
        result.put("contentHash", value.getString("contentHash"));
        result.put("publicationNumber", value.getLong("publicationNumber"));
        return result;
    }

    static JSONObject access(String json) throws JSONException {
        if (json == null || json.length() > 16384) throw new JSONException("Invalid terms access.");
        JSONObject input = new JSONObject(json);
        String state = input.optString("state");
        if (!"accepted".equals(state) && !"required".equals(state) && !"not-configured".equals(state)) throw new JSONException("Invalid terms state.");
        JSONObject result = new JSONObject();
        result.put("state", state);
        result.put("current", JSONObject.NULL);
        result.put("acceptance", JSONObject.NULL);
        if ("not-configured".equals(state)) return result;
        JSONObject ref = reference(input.optJSONObject("current"));
        result.put("current", ref);
        if (!"accepted".equals(state)) return result;
        JSONObject receipt = input.optJSONObject("acceptance");
        if (receipt == null || !Boolean.TRUE.equals(receipt.opt("accepted")) || !Boolean.TRUE.equals(receipt.opt("isAdult")) ||
            !ref.getString("id").equals(receipt.optString("termsVersionId")) ||
            !ref.getString("contentHash").equals(receipt.optString("contentHash")) ||
            ref.getLong("publicationNumber") != receipt.optLong("publicationNumber") ||
            receipt.optString("id").isEmpty() ||
            (!"web".equals(receipt.optString("channel")) && !"native".equals(receipt.optString("channel")))) throw new JSONException("Invalid terms receipt.");
        try { Instant.parse(receipt.getString("acceptedAt")); }
        catch (RuntimeException error) { throw new JSONException("Invalid receipt timestamp."); }
        JSONObject safe = new JSONObject();
        for (String key : new String[] { "id", "termsVersionId", "contentHash", "publicationNumber", "acceptedAt", "channel", "accepted", "isAdult" }) safe.put(key, receipt.get(key));
        result.put("acceptance", safe);
        return result;
    }
}
