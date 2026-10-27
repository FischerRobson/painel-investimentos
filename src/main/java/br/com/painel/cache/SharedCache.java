package br.com.painel.cache;

import java.util.Optional;

// Segunda camada do cache, compartilhada entre instâncias do Lambda (e portanto entre usuários).
public interface SharedCache {

    record Entry(byte[] value, long fetchedAt) {
    }

    Optional<Entry> get(String key);

    void put(String key, byte[] value, long fetchedAt, long expiresAtEpochSecond);
}
