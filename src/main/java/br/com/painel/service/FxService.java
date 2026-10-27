package br.com.painel.service;

import br.com.painel.cache.CacheService;
import br.com.painel.cache.Cached;
import br.com.painel.cache.Ttl;
import br.com.painel.client.AwesomeApiClient;
import br.com.painel.dto.FxQuote;
import br.com.painel.dto.FxResponse;
import br.com.painel.dto.Point;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.rest.client.inject.RestClient;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

@ApplicationScoped
public class FxService {

    public static final List<String> CODES = List.of("USD", "EUR", "GBP", "ARS", "JPY");

    private static final TypeReference<Map<String, FxQuote>> QUOTES = new TypeReference<>() {
    };
    private static final TypeReference<List<Point>> POINTS = new TypeReference<>() {
    };

    private final AwesomeApiClient client;
    private final CacheService cache;

    public FxService(@RestClient AwesomeApiClient client, CacheService cache) {
        this.client = client;
        this.cache = cache;
    }

    public FxResponse fx(int days, boolean refresh) {
        Cached<Map<String, FxQuote>> quotes = cache.get("fx:last", Ttl.of(Duration.ofMinutes(10)), QUOTES, refresh, this::fetchLast);
        Map<String, List<Point>> history = new LinkedHashMap<>();
        for (String c : CODES) {
            try {
                history.put(c, cache.get("fx:history:" + c + ":" + days, Ttl.of(Duration.ofHours(6)), POINTS, false,
                        () -> fetchHistory(c, days)).value());
            } catch (RuntimeException e) {
                history.put(c, List.of());
            }
        }
        return new FxResponse(quotes.value(), history, quotes.fetchedAt(), quotes.stale());
    }

    private Map<String, FxQuote> fetchLast() {
        JsonNode d = client.last(CODES.stream().map(c -> c + "-BRL").collect(Collectors.joining(",")));
        Map<String, FxQuote> out = new LinkedHashMap<>();
        for (String c : CODES) {
            JsonNode q = d.get(c + "BRL");
            if (q != null) {
                out.put(c, new FxQuote(q.path("name").asText().split("/")[0],
                        dbl(q, "bid"), dbl(q, "pctChange"), dbl(q, "high"), dbl(q, "low"),
                        Long.parseLong(q.path("timestamp").asText("0")) * 1000));
            }
        }
        return out;
    }

    private List<Point> fetchHistory(String code, int days) {
        TreeMap<Long, Double> byTime = new TreeMap<>();
        for (JsonNode r : client.daily(code + "-BRL", days)) {
            byTime.put(Long.parseLong(r.path("timestamp").asText("0")) * 1000, dbl(r, "bid"));
        }
        return byTime.entrySet().stream().map(e -> new Point(e.getKey(), e.getValue())).toList();
    }

    // a AwesomeAPI manda números como texto ("5.3488")
    private static double dbl(JsonNode n, String field) {
        return Double.parseDouble(n.path(field).asText("0"));
    }
}
