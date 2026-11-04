package br.com.painel.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.function.Supplier;

public final class ProviderCall {

    private static final Logger LOG = LoggerFactory.getLogger(ProviderCall.class);

    private ProviderCall() {
    }

    public static <T> T run(String provider, String operation, Supplier<T> call) {
        long start = System.nanoTime();
        try {
            T result = call.get();
            LOG.info("provider={} operation={} outcome=success durationMs={}", provider, operation, elapsedMs(start));
            return result;
        } catch (RuntimeException e) {
            LOG.warn("provider={} operation={} outcome=error durationMs={} error=\"{}\"", provider, operation, elapsedMs(start), e.getMessage());
            throw e;
        }
    }

    private static long elapsedMs(long start) {
        return (System.nanoTime() - start) / 1_000_000;
    }
}
