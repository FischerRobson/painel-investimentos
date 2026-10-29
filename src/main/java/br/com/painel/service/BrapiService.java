package br.com.painel.service;

import br.com.painel.client.BrapiClient;
import br.com.painel.config.PainelConfig;
import br.com.painel.dto.BrapiInfo;
import br.com.painel.dto.BrapiQuote;
import br.com.painel.dto.BrapiUso;
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

    public BrapiService(@RestClient BrapiClient client, PainelConfig config) {
        this.client = client;
        this.config = config;
    }

    public boolean enabled() {
        return config.brapi().token().filter(t -> !t.isBlank()).isPresent();
    }

    public BrapiInfo info() {
        return new BrapiInfo(enabled());
    }

    // Os headers RateLimit-* das cotações são do limite por minuto, não da cota do mês;
    // a cota vem desta rota própria da brapi, que não gasta consulta.
    @CacheResult(cacheName = "brapi-uso")
    public BrapiUso uso() {
        if (!enabled()) {
            return BrapiUso.DESATIVADO;
        }
        lock.lock();
        try {
            return parseUso(client.usage(auth()), System.currentTimeMillis());
        } catch (WebApplicationException e) {
            throw new BrapiException("brapi: " + errorMessage(e));
        } finally {
            lock.unlock();
        }
    }

    static BrapiUso parseUso(JsonNode body, long agora) {
        JsonNode u = body == null ? null : body.get("usage");
        if (u == null || !u.path("planLimit").isNumber() || !u.path("currentUsage").isNumber()) {
            throw new BrapiException("brapi: resposta de consumo inesperada");
        }
        JsonNode janela = u.path("usageWindow");
        long limite = u.get("planLimit").asLong(), usado = u.get("currentUsage").asLong();
        long restante = u.path("remainingUsage").isNumber() ? u.get("remainingUsage").asLong() : Math.max(0, limite - usado);
        return new BrapiUso(true, u.path("planName").asText(null), limite, usado, restante,
                janela.path("type").asText(null), janela.path("start").asText(null), janela.path("end").asText(null), agora);
    }

    private String auth() {
        return "Bearer " + config.brapi().token().orElse("");
    }

    @CacheResult(cacheName = "brapi-quote")
    public BrapiQuote quote(String ticker) {
        JsonNode body;
        lock.lock();
        try (Response r = client.quote(ticker, "3mo", "1d", "summaryProfile", auth())) {
            body = r.readEntity(JsonNode.class);
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
