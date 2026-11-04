package br.com.painel.service;

import br.com.painel.dto.BrapiQuote;
import br.com.painel.dto.DataResponse;
import br.com.painel.dto.Dividend;
import br.com.painel.dto.Fundamentals;
import br.com.painel.dto.Point;
import br.com.painel.dto.StockItem;
import br.com.painel.dto.YahooHistory;
import br.com.painel.util.Tickers;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.MissingNode;
import jakarta.enterprise.context.ApplicationScoped;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Pattern;

import static br.com.painel.util.Json.firstText;
import static br.com.painel.util.Json.num;
import static br.com.painel.util.Json.text;
import static br.com.painel.util.Numbers.or;
import static br.com.painel.util.Numbers.truthy;

// Combines three optional sources: brapi (quote, 3 months, sector/logo), Yahoo (long history, dividends,
// foreign tickers) and Fundamentus (indicators). If one fails, the item comes back with what the others returned.
@ApplicationScoped
public class StockService {

    private static final Logger LOG = LoggerFactory.getLogger(StockService.class);
    private static final long DAY_MS = 86_400_000L;
    private static final Set<String> BRAPI_RANGES = Set.of("1mo", "3mo");
    private static final Pattern FII_NAME = Pattern.compile("fundo|fii|imobili");
    private static final String SOURCE_CHART = "grafico";
    private static final String SOURCE_QUOTE = "cotacao";
    private static final String SOURCE_INDICATORS = "indicadores";

    public record PriceQuote(double price, String currency) {
    }

    private final BrapiService brapi;
    private final YahooService yahoo;
    private final FundamentusService fundamentus;

    public StockService(BrapiService brapi, YahooService yahoo, FundamentusService fundamentus) {
        this.brapi = brapi;
        this.yahoo = yahoo;
        this.fundamentus = fundamentus;
    }

    public static boolean validRange(String range) {
        return BRAPI_RANGES.contains(range) || YahooService.RANGES.containsKey(range);
    }

    public DataResponse data(List<String> tickers, String range) {
        return new DataResponse(range, tickers.isEmpty() ? List.of() : build(tickers, range), brapi.info());
    }

    private List<StockItem> build(List<String> tickers, String range) {
        Map<String, Fundamentals> fund;
        try {
            fund = fundamentus.all();
        } catch (RuntimeException e) {
            fund = Map.of();
        }
        Map<String, Fundamentals> f = fund;
        try (ExecutorService ex = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<StockItem>> futures = tickers.stream().map(t -> ex.submit(() -> one(t, range, f))).toList();
            List<StockItem> items = new ArrayList<>();
            for (int i = 0; i < futures.size(); i++) {
                try {
                    items.add(futures.get(i).get());
                } catch (ExecutionException | InterruptedException e) {
                    LOG.error("Failed to build item for {}", tickers.get(i), e);
                    StockItem err = new StockItem(tickers.get(i), tickers.get(i));
                    err.error = "erro interno";
                    items.add(err);
                }
            }
            return items;
        }
    }

    private StockItem one(String ticker, String range, Map<String, Fundamentals> fund) {
        boolean b3 = Tickers.isB3(ticker);
        String ysym = b3 ? ticker + ".SA" : ticker;
        StockItem item = new StockItem(ticker, ysym);

        BrapiQuote bq = null;
        if (brapi.enabled() && b3) {
            try {
                bq = brapi.quote(ticker);
            } catch (RuntimeException e) {
                item.warnings.add(e.getMessage());
            }
        }

        YahooHistory hist = null;
        try {
            hist = yahoo.history(ysym);
        } catch (RuntimeException ignored) {
        }

        long now = System.currentTimeMillis();
        if (BRAPI_RANGES.contains(range) && bq != null && !bq.points().isEmpty()) {
            item.points = "1mo".equals(range) ? since(bq.points(), now - 31 * DAY_MS) : bq.points();
            item.sources.put(SOURCE_CHART, "brapi");
        } else {
            String yr = YahooService.RANGES.containsKey(range) ? range : (BRAPI_RANGES.contains(range) ? "6mo" : "1y");
            try {
                List<Point> pts = yahoo.chart(ysym, yr).points();
                if ("1mo".equals(range)) {
                    pts = since(pts, now - 31 * DAY_MS);
                } else if ("3mo".equals(range)) {
                    pts = since(pts, now - 92 * DAY_MS);
                }
                item.points = pts;
                item.sources.put(SOURCE_CHART, "Yahoo");
            } catch (RuntimeException e) {
                item.points = List.of();
            }
        }

        if (bq == null && hist == null && item.points.isEmpty()) {
            item.error = "não encontrado";
            return item;
        }

        JsonNode q = bq != null ? bq.quote() : MissingNode.getInstance();
        JsonNode meta = hist != null ? hist.meta() : MissingNode.getInstance();
        JsonNode prof = q.path("summaryProfile");
        Fundamentals f = fund.get(ticker);
        Double price = or(num(q, "regularMarketPrice"), num(meta, "regularMarketPrice"));
        item.sources.put(SOURCE_QUOTE, bq != null ? "brapi" : "Yahoo");
        item.sources.put(SOURCE_INDICATORS, f != null ? "Fundamentus" : null);

        List<Dividend> divs = hist != null ? hist.dividends() : List.of();
        long yearAgo = now - 365 * DAY_MS;
        double div12 = divs.stream().filter(d -> d.date() >= yearAgo).mapToDouble(Dividend::amount).sum();
        String name = firstText(text(q, "longName"), text(meta, "longName"), ticker);
        boolean isFii = (f != null && Fundamentals.FII.equals(f.kind())) || FII_NAME.matcher(name.toLowerCase(Locale.ROOT)).find();

        item.name = name;
        item.logo = text(q, "logourl");
        item.type = isFii ? "FII" : (b3 ? "Ação" : "Exterior");
        item.currency = firstText(text(meta, "currency"), "BRL");
        item.sector = firstText(text(prof, "sectorDisp"), text(prof, "sector"));
        item.industry = firstText(f != null ? f.segment() : null, text(prof, "industryDisp"), text(prof, "industry"));
        item.summary = text(prof, "longBusinessSummary");
        item.website = text(prof, "website");
        item.price = price;
        item.change = num(q, "regularMarketChange");
        item.changePct = q.has("regularMarketChangePercent") ? num(q, "regularMarketChangePercent") : num(meta, "regularMarketChangePercent");
        item.open = num(q, "regularMarketOpen");
        item.prevClose = num(q, "regularMarketPreviousClose");
        item.dayHigh = or(num(q, "regularMarketDayHigh"), num(meta, "regularMarketDayHigh"));
        item.dayLow = or(num(q, "regularMarketDayLow"), num(meta, "regularMarketDayLow"));
        item.volume = or(num(q, "regularMarketVolume"), num(meta, "regularMarketVolume"));
        item.marketCap = or(num(q, "marketCap"), f != null ? f.marketValue() : null);
        item.high52 = or(hist != null ? hist.high52() : null, num(q, "fiftyTwoWeekHigh"));
        item.low52 = or(hist != null ? hist.low52() : null, num(q, "fiftyTwoWeekLow"));
        item.dividends = divs;
        item.div12m = div12;
        // Indicators: Fundamentus first; otherwise compute them or use brapi
        item.dy12m = f != null && truthy(f.dy()) ? f.dy() : (truthy(price) && div12 != 0 ? div12 / price : null);
        item.pe = f != null && truthy(f.pl()) ? f.pl() : num(q, "priceEarnings");
        item.pvp = f != null && truthy(f.pvp()) ? f.pvp() : null;
        item.fund = f != null ? f : Fundamentals.EMPTY;
        return item;
    }

    public PriceQuote currentPrice(String ticker) {
        boolean b3 = Tickers.isB3(ticker);
        if (b3 && brapi.enabled()) {
            try {
                Double price = num(brapi.quote(ticker).quote(), "regularMarketPrice");
                if (truthy(price)) {
                    return new PriceQuote(price, "BRL");
                }
            } catch (RuntimeException ignored) {
            }
        }
        JsonNode meta = yahoo.chart(b3 ? ticker + ".SA" : ticker, "6mo").meta();
        Double price = num(meta, "regularMarketPrice");
        if (!truthy(price)) {
            throw new IllegalStateException("no price for " + ticker);
        }
        return new PriceQuote(price, firstText(text(meta, "currency"), "BRL"));
    }

    private static List<Point> since(List<Point> pts, long cutMs) {
        return pts.stream().filter(p -> p.t() >= cutMs).toList();
    }
}
