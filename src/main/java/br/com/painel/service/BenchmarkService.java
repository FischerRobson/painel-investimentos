package br.com.painel.service;

import br.com.painel.dto.BenchmarkResponse;
import br.com.painel.dto.Point;
import br.com.painel.dto.RatePoint;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

// Series to compare the wallet with the market over the same period.
@ApplicationScoped
public class BenchmarkService {

    public static final Set<String> RANGES = Set.of("6mo", "1y", "5y");
    private static final String IBOV = "^BVSP";
    // Yahoo has no IFIX history; XFIX11 is the ETF that tracks it
    private static final String IFIX = "XFIX11.SA";

    private final YahooService yahoo;
    private final RatesService rates;

    public BenchmarkService(YahooService yahoo, RatesService rates) {
        this.yahoo = yahoo;
        this.rates = rates;
    }

    public BenchmarkResponse get(String range, List<String> fxCodes, List<String> coins) {
        List<String> warnings = new ArrayList<>();
        Map<String, List<Point>> indices = new LinkedHashMap<>();
        LocalDate start = LocalDate.now().minusMonths(switch (range) {
            case "6mo" -> 6;
            case "5y" -> 60;
            default -> 12;
        });

        List<RatePoint> ipca = List.of();
        try {
            // the rates service starts on the 1st of the month (because of IPCA): cut at the exact date
            var r = rates.rates(start);
            String since = start.toString(), firstMonth = since.substring(0, 7);
            indices.put("CDI", cumulativeIndex(r.cdi().stream().filter(p -> p.date().compareTo(since) >= 0).toList()));
            ipca = r.ipca().stream().filter(p -> p.date().substring(0, 7).compareTo(firstMonth) > 0).toList();
        } catch (RuntimeException e) {
            warnings.add("CDI indisponível (Banco Central)");
        }
        series(IBOV, range, warnings, "Ibovespa").ifPresent(p -> indices.put("IBOV", p));
        series(IFIX, range, warnings, "IFIX").ifPresent(p -> indices.put("IFIX", p));

        Map<String, List<Point>> fx = new LinkedHashMap<>();
        for (String c : fxCodes) {
            series(c + "BRL=X", range, warnings, c).ifPresent(p -> fx.put(c, p));
        }
        Map<String, List<Point>> crypto = new LinkedHashMap<>();
        List<Point> usd = fx.containsKey("USD") ? fx.get("USD") : series("USDBRL=X", range, warnings, "USD").orElse(List.of());
        for (String coin : coins) {
            series(coin + "-USD", range, warnings, coin).ifPresent(p -> crypto.put(coin, toBrl(p, usd)));
        }
        return new BenchmarkResponse(range, indices, fx, crypto, ipca, warnings);
    }

    private Optional<List<Point>> series(String symbol, String range, List<String> warnings, String label) {
        try {
            List<Point> pts = yahoo.chart(symbol, range).points();
            if (!pts.isEmpty()) {
                return Optional.of(pts);
            }
        } catch (RuntimeException ignored) {
        }
        warnings.add(label + " indisponível");
        return Optional.empty();
    }

    // Daily CDI (% per day) -> cumulative index starting at 1. Each point sits at market close (21:00 UTC = 18:00 in
    // Brasília), after Yahoo's daily points (13:00 UTC), so both line up on the same day.
    static List<Point> cumulativeIndex(List<RatePoint> daily) {
        List<Point> out = new ArrayList<>(daily.size());
        double idx = 1;
        for (RatePoint r : daily) {
            idx *= 1 + r.value() / 100;
            out.add(new Point(LocalDate.parse(r.date()).atTime(21, 0).toInstant(ZoneOffset.UTC).toEpochMilli(), idx));
        }
        return out;
    }

    // USD price x USD/BRL on the same day (or the last earlier day with a quote)
    static List<Point> toBrl(List<Point> inUsd, List<Point> usdBrl) {
        List<Point> out = new ArrayList<>(inUsd.size());
        int j = 0;
        for (Point p : inUsd) {
            while (j + 1 < usdBrl.size() && usdBrl.get(j + 1).t() <= p.t()) {
                j++;
            }
            if (!usdBrl.isEmpty() && usdBrl.get(j).t() <= p.t()) {
                out.add(new Point(p.t(), p.v() * usdBrl.get(j).v()));
            }
        }
        return out;
    }
}
