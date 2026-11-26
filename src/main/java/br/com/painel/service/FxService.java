package br.com.painel.service;

import br.com.painel.client.AwesomeApiClient;
import br.com.painel.client.FrankfurterClient;
import br.com.painel.config.AppConfig;
import br.com.painel.dto.FxQuote;
import br.com.painel.dto.FxResponse;
import br.com.painel.dto.Point;
import br.com.painel.util.ProviderCall;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.rest.client.inject.RestClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

// Quotes in reais. AwesomeAPI first (commercial rate, intraday); when it fails or limits the requests (429, common from the
// shared IPs of Lambda), the European Central Bank reference rate (Frankfurter, one call for all codes, no ARS); when both
// fail, the last good answer (memory, then disk) marked as stale.
@ApplicationScoped
public class FxService {

    public static final List<String> CODES = List.of("USD", "EUR", "GBP", "ARS", "JPY");

    private static final Logger LOG = LoggerFactory.getLogger(FxService.class);
    private static final String PROVIDER = "awesomeapi";
    private static final DateTimeFormatter STALE_FMT = DateTimeFormatter.ofPattern("dd/MM HH:mm");
    // after a failure (429 most of the time), AwesomeAPI is left alone for a while so the next requests don't keep the limit on
    private static final long PAUSE_MS = 3 * 60_000;
    // ECB publishes at about 16:00 CET
    private static final ZoneId ECB_ZONE = ZoneId.of("Europe/Berlin");
    private static final Map<String, String> NAMES = Map.of("USD", "Dólar Americano", "EUR", "Euro", "GBP", "Libra Esterlina",
            "ARS", "Peso Argentino", "JPY", "Iene Japonês");

    private final AwesomeApiClient client;
    private final FrankfurterClient ecb;
    private final ObjectMapper mapper;
    private final Path diskFile;
    private final Map<Integer, Saved> lastGood = new ConcurrentHashMap<>();
    private volatile long pausedUntil;

    record Saved(FxResponse response, long savedAt) {
    }

    public FxService(@RestClient AwesomeApiClient client, @RestClient FrankfurterClient ecb, ObjectMapper mapper, AppConfig config) {
        this.client = client;
        this.ecb = ecb;
        this.mapper = mapper;
        this.diskFile = Path.of(config.fxCacheFile());
    }

    public FxResponse fx(int days) {
        Map<String, FxQuote> quotes = new LinkedHashMap<>();
        Map<String, List<Point>> history = new LinkedHashMap<>();
        RuntimeException error = null;
        if (awesomeOpen()) {
            try {
                quotes.putAll(last());
                for (String c : CODES) {
                    history.put(c, history(c, days));
                }
            } catch (RuntimeException e) {
                error = e;
                pausedUntil = System.currentTimeMillis() + PAUSE_MS;
            }
        }
        String source = null;
        if (quotes.size() < CODES.size() || history.size() < CODES.size()) {
            try {
                Map<String, List<Point>> series = ecbSeries(days);
                for (var e : series.entrySet()) {
                    history.putIfAbsent(e.getKey(), e.getValue());
                    if (!quotes.containsKey(e.getKey())) {
                        FxQuote q = quoteFromSeries(NAMES.get(e.getKey()), e.getValue());
                        if (q != null) {
                            quotes.put(e.getKey(), q);
                            source = "bce";
                        }
                    }
                }
            } catch (RuntimeException e) {
                if (error == null) {
                    error = e;
                }
            }
        }
        if (!quotes.isEmpty() && quotes.size() < CODES.size()) {
            // the ECB has no ARS: keeps the last good quote of what is missing, so the wallet doesn't value it at zero
            FxResponse old = previous(days);
            if (old != null) {
                for (String c : CODES) {
                    if (!quotes.containsKey(c) && old.quotes().get(c) != null) {
                        quotes.put(c, old.quotes().get(c));
                        history.putIfAbsent(c, old.history().getOrDefault(c, List.of()));
                    }
                }
            }
        }
        if (!quotes.isEmpty()) {
            Map<String, List<Point>> ordered = new LinkedHashMap<>();
            Map<String, FxQuote> orderedQuotes = new LinkedHashMap<>();
            for (String c : CODES) {
                ordered.put(c, history.getOrDefault(c, List.of()));
                if (quotes.containsKey(c)) {
                    orderedQuotes.put(c, quotes.get(c));
                }
            }
            FxResponse r = new FxResponse(orderedQuotes, ordered, source, null);
            remember(days, r);
            return r;
        }
        FxResponse old = previous(days);
        if (old != null) {
            LOG.warn("FX sources unavailable ({}); using the answer from {}", error == null ? "paused" : error.getMessage(), old.stale());
            return old;
        }
        throw error != null ? error : new IllegalStateException("cotações indisponíveis");
    }

    private boolean awesomeOpen() {
        return System.currentTimeMillis() >= pausedUntil;
    }

    @CacheResult(cacheName = "fx-last")
    public Map<String, FxQuote> last() {
        String pairs = CODES.stream().map(c -> c + "-BRL").collect(Collectors.joining(","));
        JsonNode d = ProviderCall.run(PROVIDER, "last " + pairs, () -> client.last(pairs));
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
        for (JsonNode r : ProviderCall.run(PROVIDER, "daily " + code + " " + days + "d", () -> client.daily(code + "-BRL", days))) {
            byTime.put(Long.parseLong(r.path("timestamp").asText("0")) * 1000, dbl(r, "bid"));
        }
        return byTime.entrySet().stream().map(e -> new Point(e.getKey(), e.getValue())).toList();
    }

    @CacheResult(cacheName = "fx-ecb")
    public Map<String, List<Point>> ecbSeries(int days) {
        // a few extra days so the first point of the period exists even after weekends and holidays
        String range = LocalDate.now(ECB_ZONE).minusDays(days + 4L) + "..";
        String symbols = String.join(",", CODES);
        return parseEcb(ProviderCall.run("frankfurter", "series " + days + "d", () -> ecb.series(range, "BRL", symbols)), days);
    }

    // Frankfurter answers "1 BRL = x USD"; the panel shows "1 USD = 1/x BRL". Keeps the last `days` days.
    static Map<String, List<Point>> parseEcb(JsonNode d, int days) {
        Map<String, List<Point>> out = new LinkedHashMap<>();
        long from = LocalDate.now(ECB_ZONE).minusDays(days).atStartOfDay(ECB_ZONE).toInstant().toEpochMilli();
        for (Iterator<Map.Entry<String, JsonNode>> it = d.path("rates").fields(); it.hasNext(); ) {
            var day = it.next();
            long t = LocalDate.parse(day.getKey()).atTime(16, 0).atZone(ECB_ZONE).toInstant().toEpochMilli();
            for (Iterator<Map.Entry<String, JsonNode>> rs = day.getValue().fields(); rs.hasNext(); ) {
                var r = rs.next();
                double perBrl = r.getValue().asDouble();
                if (perBrl > 0) {
                    out.computeIfAbsent(r.getKey(), k -> new ArrayList<>()).add(new Point(t, 1 / perBrl));
                }
            }
        }
        out.replaceAll((code, pts) -> {
            pts.sort((a, b) -> Long.compare(a.t(), b.t()));
            // keeps one point before the period so the variation of the period has a start
            int first = 0;
            while (first + 1 < pts.size() && pts.get(first + 1).t() < from) {
                first++;
            }
            return List.copyOf(pts.subList(first, pts.size()));
        });
        return out;
    }

    // Quote from the reference series: last value, change against the previous business day
    static FxQuote quoteFromSeries(String name, List<Point> pts) {
        if (pts.isEmpty()) {
            return null;
        }
        Point last = pts.get(pts.size() - 1);
        double pct = pts.size() > 1 ? (last.v() / pts.get(pts.size() - 2).v() - 1) * 100 : 0;
        return new FxQuote(name, last.v(), pct, last.v(), last.v(), last.t());
    }

    private void remember(int days, FxResponse r) {
        lastGood.put(days, new Saved(r, System.currentTimeMillis()));
        try {
            Map<String, Object> file = new LinkedHashMap<>();
            file.put("days", days);
            file.put("saved", System.currentTimeMillis());
            file.put("response", r);
            mapper.writeValue(diskFile.toFile(), file);
        } catch (IOException | RuntimeException e) {
            LOG.warn("Could not save {}: {}", diskFile, e.getMessage());
        }
    }

    private FxResponse previous(int days) {
        Saved s = lastGood.get(days);
        if (s == null) {
            s = lastGood.values().stream().max((a, b) -> Long.compare(a.savedAt(), b.savedAt())).orElse(null);
        }
        if (s == null && Files.exists(diskFile)) {
            try {
                JsonNode old = mapper.readTree(diskFile.toFile());
                s = new Saved(mapper.treeToValue(old.path("response"), FxResponse.class), old.path("saved").asLong());
            } catch (IOException | RuntimeException e) {
                return null;
            }
        }
        if (s == null) {
            return null;
        }
        String when = STALE_FMT.format(Instant.ofEpochMilli(s.savedAt()).atZone(ZoneId.of("America/Sao_Paulo")));
        return new FxResponse(s.response().quotes(), s.response().history(), s.response().source(), when);
    }

    // AwesomeAPI sends numbers as text ("5.3488")
    private static double dbl(JsonNode n, String field) {
        return Double.parseDouble(n.path(field).asText("0"));
    }
}
