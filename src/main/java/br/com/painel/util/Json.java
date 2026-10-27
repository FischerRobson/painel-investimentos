package br.com.painel.util;

import com.fasterxml.jackson.databind.JsonNode;

public final class Json {

    private Json() {
    }

    public static Double num(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return v != null && v.isNumber() ? v.doubleValue() : null;
    }

    public static String text(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return v != null && v.isTextual() && !v.asText().isEmpty() ? v.asText() : null;
    }

    public static String firstText(String... values) {
        for (String v : values) {
            if (v != null && !v.isEmpty()) {
                return v;
            }
        }
        return null;
    }
}
