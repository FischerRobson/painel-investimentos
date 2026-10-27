package br.com.painel.service;

import br.com.painel.client.YahooClient;
import br.com.painel.dto.Dividend;
import br.com.painel.dto.Point;
import br.com.painel.dto.YahooChart;
import br.com.painel.dto.YahooHistory;
import br.com.painel.util.Numbers;
import br.com.painel.util.PriceCleaner;
import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.rest.client.inject.RestClient;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

@ApplicationScoped
public class YahooService {

    public static final Map<String, String> RANGES = Map.of("6mo", "1d", "1y", "1d", "5y", "1wk", "max", "1mo");

    private static final long YEAR_MS = 365L * 86_400_000;

    private final YahooClient client;

    public YahooService(@RestClient YahooClient client) {
        this.client = client;
    }

    @CacheResult(cacheName = "yahoo-chart")
    public YahooChart chart(String symbol, String range) {
        JsonNode res = result(client.chart(symbol, range, RANGES.get(range), "div"));
        return new YahooChart(res.path("meta"), points(res));
    }

    @CacheResult(cacheName = "yahoo-history")
    public YahooHistory history(String symbol) {
        JsonNode res = result(client.chart(symbol, "2y", "1d", "div"));

        List<Dividend> dividends = new ArrayList<>();
        res.path("events").path("dividends").forEach(d ->
                dividends.add(new Dividend(d.path("date").asLong() * 1000, d.path("amount").asDouble())));
        dividends.sort(Comparator.comparingLong(Dividend::date));

        long yearAgo = System.currentTimeMillis() - YEAR_MS;
        Double low = null;
        Double high = null;
        for (Point p : points(res)) {
            if (p.t() >= yearAgo) {
                low = low == null ? p.v() : Math.min(low, p.v());
                high = high == null ? p.v() : Math.max(high, p.v());
            }
        }
        return new YahooHistory(res.path("meta"), dividends, low, high);
    }

    private static JsonNode result(JsonNode body) {
        JsonNode res = body.path("chart").path("result").path(0);
        if (res.isMissingNode() || res.isNull()) {
            throw new IllegalStateException("Yahoo: ativo não encontrado");
        }
        return res;
    }

    private static List<Point> points(JsonNode res) {
        JsonNode ts = res.path("timestamp");
        JsonNode closes = res.path("indicators").path("quote").path(0).path("close");
        List<Point> out = new ArrayList<>();
        for (int i = 0; i < ts.size() && i < closes.size(); i++) {
            JsonNode c = closes.get(i);
            if (c != null && c.isNumber()) {
                out.add(new Point(ts.get(i).asLong() * 1000, Numbers.round(c.asDouble(), 4)));
            }
        }
        return PriceCleaner.clean(out);
    }
}
