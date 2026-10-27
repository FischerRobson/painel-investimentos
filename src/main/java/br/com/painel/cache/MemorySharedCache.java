package br.com.painel.cache;

import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

// Desenvolvimento local e testes: sem AWS.
public class MemorySharedCache implements SharedCache {

    private final ConcurrentHashMap<String, Entry> entries = new ConcurrentHashMap<>();

    @Override
    public Optional<Entry> get(String key) {
        return Optional.ofNullable(entries.get(key));
    }

    @Override
    public void put(String key, byte[] value, long fetchedAt, long expiresAtEpochSecond) {
        entries.put(key, new Entry(value, fetchedAt));
    }
}
