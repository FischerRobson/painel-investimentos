package br.com.painel.cache;

/** Valor vindo do cache ou da fonte, com a hora em que foi buscado (ms) e se está vencido. */
public record Cached<T>(T value, long fetchedAt, boolean stale) {
}
