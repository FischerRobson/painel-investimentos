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
import java.util.Set;

// Séries para comparar a carteira com o mercado no mesmo período.
@ApplicationScoped
public class BenchmarkService {

    public static final Set<String> RANGES = Set.of("6mo", "1y", "5y");
    private static final String IBOV = "^BVSP";
    // o Yahoo não tem o histórico do IFIX; o XFIX11 é o ETF que o replica
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
            // o serviço de taxas começa no dia 1 do mês (por causa do IPCA): corta na data exata
            var r = rates.rates(start);
            String desde = start.toString(), mesInicial = desde.substring(0, 7);
            indices.put("CDI", indiceAcumulado(r.cdi().stream().filter(p -> p.date().compareTo(desde) >= 0).toList()));
            ipca = r.ipca().stream().filter(p -> p.date().substring(0, 7).compareTo(mesInicial) > 0).toList();
        } catch (RuntimeException e) {
            warnings.add("CDI indisponível (Banco Central)");
        }
        serie(IBOV, range, warnings, "Ibovespa").ifPresent(p -> indices.put("IBOV", p));
        serie(IFIX, range, warnings, "IFIX").ifPresent(p -> indices.put("IFIX", p));

        Map<String, List<Point>> fx = new LinkedHashMap<>();
        for (String c : fxCodes) {
            serie(c + "BRL=X", range, warnings, c).ifPresent(p -> fx.put(c, p));
        }
        Map<String, List<Point>> crypto = new LinkedHashMap<>();
        List<Point> usd = fx.containsKey("USD") ? fx.get("USD") : serie("USDBRL=X", range, warnings, "USD").orElse(List.of());
        for (String coin : coins) {
            serie(coin + "-USD", range, warnings, coin).ifPresent(p -> crypto.put(coin, emReais(p, usd)));
        }
        return new BenchmarkResponse(range, indices, fx, crypto, ipca, warnings);
    }

    private java.util.Optional<List<Point>> serie(String symbol, String range, List<String> warnings, String nome) {
        try {
            List<Point> pts = yahoo.chart(symbol, range).points();
            if (!pts.isEmpty()) {
                return java.util.Optional.of(pts);
            }
        } catch (RuntimeException ignored) {
        }
        warnings.add(nome + " indisponível");
        return java.util.Optional.empty();
    }

    // CDI diário (% ao dia) → índice acumulado começando em 1. Cada ponto fica no fim do pregão (21h UTC = 18h em
    // Brasília), depois dos pontos diários do Yahoo (13h UTC), para os dois casarem no mesmo dia.
    static List<Point> indiceAcumulado(List<RatePoint> diario) {
        List<Point> out = new ArrayList<>(diario.size());
        double idx = 1;
        for (RatePoint r : diario) {
            idx *= 1 + r.value() / 100;
            out.add(new Point(LocalDate.parse(r.date()).atTime(21, 0).toInstant(ZoneOffset.UTC).toEpochMilli(), idx));
        }
        return out;
    }

    // Preço em dólar × cotação do dólar no mesmo dia (ou no último dia anterior com cotação)
    static List<Point> emReais(List<Point> emDolar, List<Point> usdBrl) {
        List<Point> out = new ArrayList<>(emDolar.size());
        int j = 0;
        for (Point p : emDolar) {
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
