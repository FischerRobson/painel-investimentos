package br.com.painel.demo;

import br.com.painel.dto.Dividend;
import br.com.painel.dto.Fundamentals;
import br.com.painel.dto.Point;
import br.com.painel.dto.RatePoint;
import br.com.painel.dto.StockItem;
import br.com.painel.model.Bem;
import br.com.painel.model.Carteira;
import br.com.painel.model.Moeda;
import br.com.painel.model.Posicao;
import br.com.painel.model.TituloRf;
import br.com.painel.service.CryptoService;
import br.com.painel.service.FxService;
import br.com.painel.util.Tickers;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.MultivaluedMap;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;

// Dados fictícios do modo demonstração. As séries são passeios aleatórios com semente fixa por ativo:
// ficam iguais a cada recarga e terminam sempre no mesmo preço, qualquer que seja o período.
@ApplicationScoped
public class DemoDataService {

    public record Resposta(int status, Object corpo, String etag) {
    }

    private static final String[] MESES = {"janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
            "agosto", "setembro", "outubro", "novembro", "dezembro"};
    private static final Map<String, Double> PRECOS = Map.of("ITSA4", 10.8, "WEGE3", 38.5, "TAEE11", 36.2,
            "HGLG11", 158.0, "XPLG11", 98.0, "AAPL", 230.0);
    private static final Map<String, Double> CRIPTO = Map.of("BTC", 420_000.0, "ETH", 13_000.0, "SOL", 950.0,
            "USDT", 5.4, "USDC", 5.4, "XRP", 13.0, "BNB", 3_500.0, "ADA", 3.5, "DOGE", 1.1, "LINK", 80.0);
    private static final Map<String, Object[]> MOEDAS = Map.of("USD", new Object[]{"Dólar Americano", 5.42},
            "EUR", new Object[]{"Euro", 5.95}, "GBP", new Object[]{"Libra Esterlina", 7.10},
            "ARS", new Object[]{"Peso Argentino", 0.0047}, "JPY", new Object[]{"Iene Japonês", 0.036});

    public Resposta responder(String metodo, String path, MultivaluedMap<String, String> q) {
        boolean get = "GET".equals(metodo);
        return switch (path) {
            case "/api/carteira" -> get ? new Resposta(200, carteira(), "demo")
                    : new Resposta(200, Map.of("etag", "demo"), "demo");
            case "/api/historico" -> new Resposta(200, historico(), null);
            case "/api/backup" -> new Resposta(200, backup(), null);
            case "/api/backup/import" -> new Resposta(400, Map.of("error", "Indisponível no modo demonstração"), null);
            case "/api/data" -> new Resposta(200, data(q.getFirst("symbols"), param(q, "range", "1y")), null);
            case "/api/crypto" -> new Resposta(200, crypto(q.getFirst("coins")), null);
            case "/api/fx" -> new Resposta(200, fx(Integer.parseInt(param(q, "days", "30").replaceAll("\\D", "0"))), null);
            case "/api/rates" -> new Resposta(200, rates(param(q, "from", LocalDate.now().minusYears(1).toString())), null);
            case "/api/benchmarks" -> new Resposta(200, benchmarks(param(q, "range", "1y"), q.getFirst("fx"), q.getFirst("crypto")), null);
            case "/api/custos" -> new Resposta(200, custos(), null);
            default -> path.startsWith("/api/historico/") ? new Resposta(204, null, null)
                    : path.startsWith("/api/fipe/") ? new Resposta(200, Map.of("data", fipe(path.substring(10), q)), null)
                    : new Resposta(404, Map.of("error", "não disponível no modo demonstração"), null);
        };
    }

    // ------------------------------------------------------------------ dados do usuário

    Carteira carteira() {
        LocalDate hoje = LocalDate.now();
        Map<String, Double> hist = new LinkedHashMap<>();
        for (int i = 2; i >= 0; i--) {
            hist.put(mesFipe(hoje.minusMonths(i)), 74_800.0 - (2 - i) * 650);
        }
        String ultimo = mesFipe(hoje);
        return new Carteira(
                List.of(new Posicao("ITSA4", 400.0), new Posicao("WEGE3", 50.0), new Posicao("TAEE11", 120.0),
                        new Posicao("HGLG11", 30.0), new Posicao("XPLG11", 40.0), new Posicao("AAPL", 5.0)),
                List.of(new Posicao("BTC", 0.02), new Posicao("ETH", 0.5)),
                List.of(new TituloRf("demo-cdb", "CDB Banco Exemplo", "CDB", "cdi", 105.0, 15_000.0, hoje.minusMonths(20).toString(), hoje.plusYears(2).toString(), false),
                        new TituloRf("demo-lci", "LCI Banco Fictício", "LCI", "cdi", 93.0, 8_000.0, hoje.minusMonths(9).toString(), hoje.plusMonths(15).toString(), true),
                        new TituloRf("demo-ipca", "Tesouro IPCA+ 2032", "Tesouro IPCA+", "ipca", 5.5, 6_000.0, hoje.minusYears(3).toString(), "2032-08-15", false),
                        new TituloRf("demo-pre", "Tesouro Prefixado 2029", "Tesouro Prefixado", "pre", 12.8, 5_000.0, hoje.minusMonths(14).toString(), "2029-01-01", false)),
                List.of(new Moeda("USD", 500.0), new Moeda("EUR", 200.0)),
                List.of(new Bem("demo-carro", "cars", "1", "1003", "2022-1", "Carro de exemplo",
                        new Bem.Info("Montadora Demo", "SUV Fictício 1.5 Turbo", 2022, "Gasolina", "000000-0"),
                        new Bem.Ultimo(ultimo, hist.get(ultimo)), hist)),
                Map.of("listaPainel", "ITSA4, WEGE3, TAEE11, HGLG11, XPLG11, AAPL"));
    }

    Map<String, Object> historico() {
        Random r = new Random(42);
        Map<String, Object> out = new TreeMap<>();
        double inv = 96_000;
        LocalDate d = LocalDate.now().minusDays(120);
        for (; !d.isAfter(LocalDate.now()); d = d.plusDays(1)) {
            if (!diaUtil(d)) {
                continue;
            }
            inv *= 1 + 0.0006 + 0.004 * r.nextGaussian();
            double bens = 74_000;
            out.put(d.toString(), Map.of("t", round(inv + bens), "i", round(inv), "rv", round(inv * 0.32),
                    "rf", round(inv * 0.5), "cr", round(inv * 0.12), "fx", round(inv * 0.06), "bens", bens));
        }
        return out;
    }

    Map<String, Object> backup() {
        Carteira c = carteira();
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("app", "painel-acoes");
        b.put("versao", 2);
        b.put("acoesFiis", c.acoesFiis());
        b.put("cripto", c.cripto());
        b.put("rendaFixa", c.rendaFixa());
        b.put("moedas", c.moedas());
        b.put("bens", c.bens());
        b.put("historico", historico());
        b.put("preferencias", c.preferencias());
        return b;
    }

    // ------------------------------------------------------------------ mercado

    Map<String, Object> data(String symbols, String range) {
        List<StockItem> items = Tickers.parse(symbols).stream().map(t -> ativo(t, range)).toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("range", range);
        out.put("items", items);
        out.put("brapi", Map.of("enabled", false));
        out.put("fetchedAt", System.currentTimeMillis());
        out.put("stale", false);
        return out;
    }

    StockItem ativo(String ticker, String range) {
        boolean b3 = Tickers.isB3(ticker);
        boolean fii = b3 && ticker.endsWith("11") && !ticker.equals("TAEE11");
        double preco = PRECOS.getOrDefault(ticker, 5 + Math.abs(ticker.hashCode() % 2000) / 10.0);
        Random r = new Random(ticker.hashCode());
        StockItem it = new StockItem(ticker, b3 ? ticker + ".SA" : ticker);
        it.points = serie(ticker, range, preco, fii ? 0.008 : 0.016);
        List<Point> ano = serie(ticker, "1y", preco, fii ? 0.008 : 0.016);
        double anterior = it.points.size() > 1 ? it.points.get(it.points.size() - 2).v() : preco;
        it.sources.putAll(Map.of("grafico", "demo", "cotacao", "demo", "indicadores", "demo"));
        it.type = fii ? "FII" : (b3 ? "Ação" : "Exterior");
        it.currency = b3 ? "BRL" : "USD";
        it.name = fii ? "Fundo Imobiliário Demonstração " + ticker : (b3 ? "Companhia Demonstração " + ticker : "Demo Corp. " + ticker);
        it.sector = fii ? "Fundos Imobiliários" : "Demonstração";
        it.industry = fii ? List.of("Logística", "Lajes Corporativas", "Shoppings").get(Math.abs(ticker.hashCode()) % 3) : "Dados fictícios";
        it.summary = "Ativo de demonstração: preços, proventos e indicadores são gerados e não correspondem à realidade.";
        it.price = preco;
        it.change = preco - anterior;
        it.changePct = (preco / anterior - 1) * 100;
        it.open = anterior * (1 + 0.003 * r.nextGaussian());
        it.prevClose = anterior;
        it.dayHigh = Math.max(preco, anterior) * 1.006;
        it.dayLow = Math.min(preco, anterior) * 0.994;
        it.volume = (double) (fii ? 20_000 + r.nextInt(80_000) : 1_000_000 + r.nextInt(30_000_000));
        it.marketCap = preco * (fii ? 2e7 : 1e9) * (1 + r.nextDouble());
        it.high52 = ano.stream().mapToDouble(Point::v).max().orElse(preco);
        it.low52 = ano.stream().mapToDouble(Point::v).min().orElse(preco);
        it.dividends = proventos(it.type, preco * (0.6 + 0.8 * r.nextDouble()));
        long umAno = System.currentTimeMillis() - 365L * 86_400_000;
        it.div12m = it.dividends.stream().filter(d -> d.date() >= umAno).mapToDouble(Dividend::amount).sum();
        it.dy12m = it.div12m / preco;
        it.fund = fii
                ? Fundamentals.fii(it.industry, it.dy12m, 0.85 + 0.2 * r.nextDouble(), it.dy12m * 1.1, it.marketCap, 5e6, 10.0 + r.nextInt(30), 0.07 + 0.02 * r.nextDouble(), 0.02 + 0.06 * r.nextDouble())
                : b3 ? Fundamentals.acao(8 + 12 * r.nextDouble(), 0.8 + 2.2 * r.nextDouble(), it.dy12m, 0.10 + 0.15 * r.nextDouble(), 0.08 + 0.12 * r.nextDouble(), 0.10 + 0.20 * r.nextDouble(), 4 + 8 * r.nextDouble(), 0.2 + r.nextDouble(), 0.05 + 0.10 * r.nextDouble(), 5e7, 1e10)
                : Fundamentals.EMPTY;
        it.pe = it.fund.pl();
        it.pvp = it.fund.pvp();
        return it;
    }

    private static List<Dividend> proventos(String tipo, double preco) {
        List<Dividend> out = new ArrayList<>();
        int passo = "FII".equals(tipo) ? 1 : 3;
        double valor = "FII".equals(tipo) ? preco * 0.0075 : preco * ("Exterior".equals(tipo) ? 0.0012 : 0.015);
        for (int m = 24; m >= 1; m -= passo) {
            out.add(new Dividend(ms(LocalDate.now().minusMonths(m).withDayOfMonth(15)), round4(valor)));
        }
        return out;
    }

    Map<String, Object> crypto(String coins) {
        Map<String, Object> precos = new LinkedHashMap<>();
        for (String c : lista(coins)) {
            if (CRIPTO.containsKey(c)) {
                precos.put(c, Map.of("price", CRIPTO.get(c), "changePct", variacaoDoDia(c, 3)));
            }
        }
        return Map.of("prices", precos, "available", List.copyOf(CryptoService.COINS.keySet()),
                "fetchedAt", System.currentTimeMillis(), "stale", false);
    }

    Map<String, Object> fx(int dias) {
        int n = Math.max(2, Math.min(dias, 360));
        Map<String, Object> quotes = new LinkedHashMap<>();
        Map<String, Object> hist = new LinkedHashMap<>();
        for (String c : FxService.CODES) {
            String nome = (String) MOEDAS.get(c)[0];
            double bid = (double) MOEDAS.get(c)[1];
            double pct = variacaoDoDia(c, 0.6);
            quotes.put(c, Map.of("name", nome, "bid", bid, "pct", pct, "high", bid * 1.004, "low", bid * 0.996,
                    "time", System.currentTimeMillis()));
            hist.put(c, passeio("fx-" + c, diasCorridos(n), bid, 0.006));
        }
        return Map.of("quotes", quotes, "history", hist, "fetchedAt", System.currentTimeMillis(), "stale", false);
    }

    Map<String, Object> rates(String from) {
        LocalDate inicio;
        try {
            inicio = LocalDate.parse(from).withDayOfMonth(1);
        } catch (RuntimeException e) {
            return Map.of("error", "data inválida");
        }
        List<RatePoint> cdi = new ArrayList<>();
        for (LocalDate d = inicio; d.isBefore(LocalDate.now()); d = d.plusDays(1)) {
            if (diaUtil(d)) {
                cdi.add(new RatePoint(d.toString(), 0.0508));
            }
        }
        List<RatePoint> ipca = new ArrayList<>();
        Random r = new Random(7);
        for (LocalDate m = inicio; m.isBefore(LocalDate.now().withDayOfMonth(1)); m = m.plusMonths(1)) {
            ipca.add(new RatePoint(m.toString(), round4(0.25 + 0.3 * r.nextDouble())));
        }
        return Map.of("cdi", cdi, "ipca", ipca);
    }

    Map<String, Object> benchmarks(String range, String fx, String crypto) {
        List<LocalDate> dias = diasDoPeriodo(range);
        List<Point> cdi = new ArrayList<>();
        double idx = 1;
        for (LocalDate d : dias) {
            idx *= 1.000508;
            cdi.add(new Point(d.atTime(21, 0).toInstant(ZoneOffset.UTC).toEpochMilli(), idx));
        }
        Map<String, Object> indices = new LinkedHashMap<>();
        indices.put("CDI", cdi);
        indices.put("IBOV", passeio("ibov", dias, 130_000, 0.011));
        indices.put("IFIX", passeio("ifix", dias, 3_300, 0.005));
        Map<String, Object> moedas = new LinkedHashMap<>();
        for (String c : lista(fx)) {
            if (MOEDAS.containsKey(c)) {
                moedas.put(c, passeio("fx-" + c, dias, (double) MOEDAS.get(c)[1], 0.006));
            }
        }
        Map<String, Object> cripto = new LinkedHashMap<>();
        for (String c : lista(crypto)) {
            if (CRIPTO.containsKey(c)) {
                cripto.put(c, passeio("cripto-" + c, dias, CRIPTO.get(c), 0.03));
            }
        }
        @SuppressWarnings("unchecked")
        List<RatePoint> ipca = (List<RatePoint>) rates(dias.get(0).toString()).get("ipca");
        return Map.of("range", range, "indices", indices, "fx", moedas, "crypto", cripto, "ipca", ipca, "warnings", List.of());
    }

    Map<String, Object> custos() {
        LocalDate hoje = LocalDate.now();
        List<Map<String, Object>> meses = new ArrayList<>();
        double[] totais = {0.0, 0.12, 0.31, 0.28, 0.44, 0.37};
        for (int i = 0; i < 6; i++) {
            String mes = hoje.withDayOfMonth(1).minusMonths(5 - i).toString().substring(0, 7);
            List<Map<String, Object>> servicos = i < 5 ? List.of() : List.of(
                    Map.of("nome", "Amazon DynamoDB", "valor", 0.21), Map.of("nome", "AWS Lambda", "valor", 0.09),
                    Map.of("nome", "Amazon Simple Storage Service", "valor", 0.05), Map.of("nome", "AWS Cost Explorer", "valor", 0.02));
            meses.add(Map.of("mes", mes, "total", totais[i], "servicos", servicos));
        }
        List<Map<String, Object>> diario = new ArrayList<>();
        for (int d = 1; d <= hoje.getDayOfMonth(); d++) {
            diario.add(Map.of("dia", hoje.withDayOfMonth(d).toString(), "valor", round4(0.005 + (d % 5) * 0.004)));
        }
        return Map.of("meses", meses, "diario", diario, "previsaoMes", 0.46, "fetchedAt", System.currentTimeMillis());
    }

    Object fipe(String kind, MultivaluedMap<String, String> q) {
        return switch (kind) {
            case "brands" -> List.of(Map.of("code", "1", "name", "Montadora Demo"), Map.of("code", "2", "name", "Motores Exemplo"));
            case "models" -> List.of(Map.of("code", "1001", "name", "Hatch Demo 1.0"), Map.of("code", "1002", "name", "Sedã Exemplo 2.0"),
                    Map.of("code", "1003", "name", "SUV Fictício 1.5 Turbo"));
            case "years" -> List.of(Map.of("code", "2024-1", "name", "2024 Gasolina"), Map.of("code", "2022-1", "name", "2022 Gasolina"),
                    Map.of("code", "2019-1", "name", "2019 Gasolina"));
            case "price" -> {
                String chave = q.getFirst("model") + q.getFirst("year");
                double base = 45_000 + Math.abs(chave.hashCode() % 60_000);
                LocalDate hoje = LocalDate.now();
                List<Map<String, Object>> hist = new ArrayList<>();
                for (int i = 2; i >= 0; i--) {
                    hist.add(Map.of("month", mesFipe(hoje.minusMonths(i)), "price", base + i * 650.0));
                }
                yield Map.of("brand", "Montadora Demo", "model", "Veículo de demonstração", "modelYear", 2022, "fuel", "Gasolina",
                        "codeFipe", "000000-0", "month", mesFipe(hoje), "price", base, "history", hist);
            }
            default -> List.of();
        };
    }

    // ------------------------------------------------------------------ séries

    // Passeio aleatório gerado de trás para frente: o último ponto é sempre "atual"
    static List<Point> passeio(String chave, List<LocalDate> dias, double atual, double vol) {
        Random r = new Random(chave.hashCode());
        double[] v = new double[dias.size()];
        v[v.length - 1] = atual;
        for (int i = v.length - 1; i > 0; i--) {
            v[i - 1] = v[i] / (1 + 0.0008 + vol * r.nextGaussian());
        }
        List<Point> out = new ArrayList<>(v.length);
        for (int i = 0; i < v.length; i++) {
            out.add(new Point(ms(dias.get(i)), round4(v[i])));
        }
        return out;
    }

    private static List<Point> serie(String ticker, String range, double atual, double vol) {
        return passeio("ativo-" + ticker, diasDoPeriodo(range), atual, vol);
    }

    static List<LocalDate> diasDoPeriodo(String range) {
        return switch (range) {
            case "1mo" -> diasUteis(22);
            case "3mo" -> diasUteis(64);
            case "6mo" -> diasUteis(126);
            case "5y" -> passos(260, 7);
            case "max" -> passos(240, 30);
            default -> diasUteis(252);
        };
    }

    private static List<LocalDate> diasUteis(int n) {
        List<LocalDate> out = new ArrayList<>();
        for (LocalDate d = LocalDate.now(); out.size() < n; d = d.minusDays(1)) {
            if (diaUtil(d)) {
                out.add(0, d);
            }
        }
        return out;
    }

    private static List<LocalDate> diasCorridos(int n) {
        return passos(n, 1);
    }

    private static List<LocalDate> passos(int n, int dias) {
        List<LocalDate> out = new ArrayList<>();
        for (int i = n - 1; i >= 0; i--) {
            out.add(LocalDate.now().minusDays((long) i * dias));
        }
        return out;
    }

    private static boolean diaUtil(LocalDate d) {
        return d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY;
    }

    private static long ms(LocalDate d) {
        return d.atTime(LocalTime.of(13, 0)).toInstant(ZoneOffset.UTC).toEpochMilli();
    }

    private static String mesFipe(LocalDate d) {
        return MESES[d.getMonthValue() - 1] + " de " + d.getYear();
    }

    private static double variacaoDoDia(String chave, double amplitude) {
        Random r = new Random((chave + LocalDate.now()).hashCode());
        return Math.round((r.nextDouble() * 2 - 1) * amplitude * 100) / 100.0;
    }

    private static List<String> lista(String csv) {
        return csv == null ? List.of() : Arrays.stream(csv.split(",")).map(s -> s.strip().toUpperCase(Locale.ROOT)).filter(s -> !s.isEmpty()).toList();
    }

    private static String param(MultivaluedMap<String, String> q, String nome, String padrao) {
        String v = q.getFirst(nome);
        return v == null || v.isBlank() ? padrao : v;
    }

    private static double round(double v) {
        return Math.round(v * 100) / 100.0;
    }

    private static double round4(double v) {
        return Math.round(v * 10_000) / 10_000.0;
    }
}
