package br.com.painel.service;

import br.com.painel.client.AwesomeApiClient;
import br.com.painel.dto.FxQuote;
import br.com.painel.dto.FxResponse;
import br.com.painel.dto.Point;
import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.rest.client.inject.RestClient;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

@ApplicationScoped
public class FxService {

    public static final List<String> CODES = List.of("USD", "EUR", "GBP", "ARS", "JPY");

    private final AwesomeApiClient client;

    public FxService(@RestClient AwesomeApiClient client) {
        this.client = client;
    }

    public FxResponse fx(int days) {
        Map<String, FxQuote> quotes = last();
        Map<String, List<Point>> history = new LinkedHashMap<>();
        for (String c : CODES) {
            try {
                history.put(c, history(c, days));
            } catch (RuntimeException e) {
                history.put(c, List.of());
            }
        }
        return new FxResponse(quotes, history);
    }

    @CacheResult(cacheName = "fx-last")
    public Map<String, FxQuote> last() {
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

    @CacheResult(cacheName = "fx-history")
    public List<Point> history(String code, int days) {
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
