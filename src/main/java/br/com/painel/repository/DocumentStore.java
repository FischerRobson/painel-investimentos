package br.com.painel.repository;

import java.util.Optional;

public interface DocumentStore {

    record Document(byte[] body, String etag) {
    }

    record Condition(Kind kind, String etag) {
        public enum Kind { ANY, ABSENT, MATCH }

        public static Condition any() {
            return new Condition(Kind.ANY, null);
        }

        public static Condition absent() {
            return new Condition(Kind.ABSENT, null);
        }

        public static Condition matches(String etag) {
            return new Condition(Kind.MATCH, etag);
        }
    }

    Optional<Document> read(String key);

    String write(String key, byte[] body, Condition condition);
}
