package br.com.painel.service;

import br.com.painel.client.BrapiClient;
import br.com.painel.config.AppConfig;
import br.com.painel.dto.BrapiInfo;
import br.com.painel.dto.BrapiQuote;
import br.com.painel.dto.BrapiUsage;
import br.com.painel.dto.Point;
import br.com.painel.util.PriceCleaner;
import br.com.painel.util.ProviderCall;
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

    private static final String PROVIDER = "brapi";

    private final BrapiClient client;
    private final AppConfig config;

    // The free plan allows one request at a time. The fair lock queues calls (a synchronous @Bulkhead would reject
    // instead of waiting); ReentrantLock instead of synchronized so virtual threads are not pinned.
    private final ReentrantLock lock = new ReentrantLock(true);

    public BrapiService(@RestClient BrapiClient client, AppConfig config) {
        this.client = client;
        this.config = config;
    }

    public boolean enabled() {
        return config.brapi().token().filter(t -> !t.isBlank()).isPresent();
    }

    public BrapiInfo info() {
        return new BrapiInfo(enabled());
    }

    // The RateLimit-* headers on quotes are the per-minute limit, not the monthly quota;
    // the quota comes from this dedicated route, which does not consume a request.
    @CacheResult(cacheName = "brapi-uso")
    public BrapiUsage usage() {
        if (!enabled()) {
            return BrapiUsage.DISABLED;
        }
        lock.lock();
        try {
            return parseUsage(ProviderCall.run(PROVIDER, "usage", () -> client.usage(auth())), System.currentTimeMillis());
        } catch (WebApplicationException e) {
            throw new BrapiException("brapi: " + errorMessage(e));
        } finally {
            lock.unlock();
        }
    }

    static BrapiUsage parseUsage(JsonNode body, long now) {
        JsonNode u = body == null ? null : body.get("usage");
        if (u == null || !u.path("planLimit").isNumber() || !u.path("currentUsage").isNumber()) {
            throw new BrapiException("brapi: resposta de consumo inesperada");
        }
        JsonNode window = u.path("usageWindow");
        long limit = u.get("planLimit").asLong(), used = u.get("currentUsage").asLong();
        long remaining = u.path("remainingUsage").isNumber() ? u.get("remainingUsage").asLong() : Math.max(0, limit - used);
        return new BrapiUsage(true, u.path("planName").asText(null), limit, used, remaining,
                window.path("type").asText(null), window.path("start").asText(null), window.path("end").asText(null), now);
    }

    private String auth() {
        return "Bearer " + config.brapi().token().orElse("");
    }

    @CacheResult(cacheName = "brapi-quote")
    public BrapiQuote quote(String ticker) {
        JsonNode body;
        lock.lock();
        try {
            body = ProviderCall.run(PROVIDER, "quote " + ticker, () -> {
                try (Response r = client.quote(ticker, "3mo", "1d", "summaryProfile", auth())) {
                    return r.readEntity(JsonNode.class);
                }
            });
        } catch (WebApplicationException e) {
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
