package br.com.painel.service;

import br.com.painel.client.BrapiClient;
import br.com.painel.config.PainelConfig;
import br.com.painel.dto.BrapiInfo;
import br.com.painel.dto.BrapiQuote;
import br.com.painel.dto.Point;
import br.com.painel.util.PriceCleaner;
import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.rest.client.inject.RestClient;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;

@ApplicationScoped
public class BrapiService {

    private final BrapiClient client;
    private final PainelConfig config;

    // O plano grátis aceita 1 requisição por vez. O lock justo enfileira as chamadas (o @Bulkhead síncrono
    // rejeitaria em vez de esperar); ReentrantLock em vez de synchronized para não prender virtual threads.
    private final ReentrantLock lock = new ReentrantLock(true);
    private volatile Integer remaining;
    private volatile Integer limit;

    public BrapiService(@RestClient BrapiClient client, PainelConfig config) {
        this.client = client;
        this.config = config;
    }

    public boolean enabled() {
        return config.brapi().token().filter(t -> !t.isBlank()).isPresent();
    }

    public BrapiInfo info() {
        return enabled() ? new BrapiInfo(true, remaining, limit) : new BrapiInfo(false, null, null);
    }

    @CacheResult(cacheName = "brapi-quote")
    public BrapiQuote quote(String ticker) {
        JsonNode body;
        lock.lock();
        try (Response r = client.quote(ticker, "3mo", "1d", "summaryProfile", "Bearer " + config.brapi().token().orElse(""))) {
            track(r);
            body = r.readEntity(JsonNode.class);
        } catch (WebApplicationException e) {
            track(e.getResponse());
            throw new BrapiException("brapi: " + errorMessage(e));
        } finally {
            lock.unlock();
        }
        JsonNode res = body.path("results").path(0);
        List<Point> points = new ArrayList<>();
        for (JsonNode h : res.path("historicalDataPrice")) {
            if (h.hasNonNull("close") && h.has("date")) {
                points.add(new Point(h.get("date").asLong() * 1000, h.get("close").asDouble()));
            }
        }
        points.sort(Comparator.comparingLong(Point::t));
        return new BrapiQuote(res, PriceCleaner.clean(points));
    }

    private void track(Response r) {
        if (r == null) {
            return;
        }
        String rem = r.getHeaderString("ratelimit-remaining");
        if (rem != null && !rem.isBlank()) {
            remaining = Integer.valueOf(rem.trim());
            String lim = r.getHeaderString("ratelimit-limit");
            limit = lim == null || lim.isBlank() ? null : Integer.valueOf(lim.trim());
        }
    }

    private static String errorMessage(WebApplicationException e) {
        try {
            return e.getResponse().readEntity(JsonNode.class).path("message").asText(e.getMessage());
        } catch (RuntimeException ignored) {
            return e.getMessage();
        }
    }

    public static class BrapiException extends RuntimeException {
        public BrapiException(String message) {
            super(message);
        }
    }
}
