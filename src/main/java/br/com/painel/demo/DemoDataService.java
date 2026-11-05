package br.com.painel.demo;

import br.com.painel.dto.Dividend;
import br.com.painel.dto.Fundamentals;
import br.com.painel.dto.Point;
import br.com.painel.dto.RatePoint;
import br.com.painel.dto.StockItem;
import br.com.painel.dto.BudgetMonthSummary;
import br.com.painel.model.BudgetArea;
import br.com.painel.model.BudgetMonth;
import br.com.painel.model.BudgetRules;
import br.com.painel.model.DescriptionRule;
import br.com.painel.model.BudgetSettings;
import br.com.painel.model.CurrencyHolding;
import br.com.painel.model.Expense;
import br.com.painel.model.Formats;
import br.com.painel.model.Income;
import br.com.painel.model.FixedIncome;
import br.com.painel.model.Position;
import br.com.painel.model.Vehicle;
import br.com.painel.model.Wallet;
import br.com.painel.service.BudgetService;
import br.com.painel.service.CryptoService;
import br.com.painel.service.FxService;
import br.com.painel.util.Tickers;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.MultivaluedMap;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;

// Fake data for demo mode. Series are random walks with a fixed seed per asset:
// they stay the same on every reload and always end at the same price, whatever the period.
@ApplicationScoped
public class DemoDataService {

    public record Reply(int status, Object body, String etag) {
    }

    private static final String BUDGET_MONTHS = "/api/budget/months/";
    private static final BudgetRules DEMO_RULES = new BudgetRules(List.of(
            new DescriptionRule("demo-rule-1", "Posto Shell", "Combustível", BudgetArea.FIXED_COSTS),
            new DescriptionRule("demo-rule-2", "Uber", "Aplicativo de transporte", BudgetArea.COMFORT)));
    private record DemoExpense(String description, BudgetArea area, double amount, int day, boolean fixed) {
    }

    private static final List<DemoExpense> DEMO_EXPENSES = List.of(
            new DemoExpense("Aluguel", BudgetArea.FIXED_COSTS, 2400.0, 5, true),
            new DemoExpense("Condomínio", BudgetArea.FIXED_COSTS, 650.0, 5, true),
            new DemoExpense("Energia elétrica", BudgetArea.FIXED_COSTS, 210.0, 12, false),
            new DemoExpense("Internet e celular", BudgetArea.FIXED_COSTS, 180.0, 15, true),
            new DemoExpense("Supermercado", BudgetArea.FIXED_COSTS, 1150.0, 8, false),
            new DemoExpense("Plano de saúde", BudgetArea.FIXED_COSTS, 480.0, 10, true),
            new DemoExpense("Faxina", BudgetArea.COMFORT, 400.0, 20, true),
            new DemoExpense("Aplicativo de transporte", BudgetArea.COMFORT, 260.0, 18, false),
            new DemoExpense("Restaurante", BudgetArea.PLEASURES, 340.0, 14, false),
            new DemoExpense("Cinema e streaming", BudgetArea.PLEASURES, 120.0, 22, false),
            new DemoExpense("Curso de inglês", BudgetArea.EDUCATION, 390.0, 7, true),
            new DemoExpense("Livros", BudgetArea.EDUCATION, 95.0, 25, false));

    private static final String[] MONTHS = {"janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
            "agosto", "setembro", "outubro", "novembro", "dezembro"};
    private static final Map<String, Double> PRICES = Map.of("ITSA4", 10.8, "WEGE3", 38.5, "TAEE11", 36.2,
            "HGLG11", 158.0, "XPLG11", 98.0, "AAPL", 230.0);
    private static final Map<String, Double> CRYPTO = Map.of("BTC", 420_000.0, "ETH", 13_000.0, "SOL", 950.0,
            "USDT", 5.4, "USDC", 5.4, "XRP", 13.0, "BNB", 3_500.0, "ADA", 3.5, "DOGE", 1.1, "LINK", 80.0);
    private static final Map<String, Object[]> CURRENCIES = Map.of("USD", new Object[]{"Dólar Americano", 5.42},
            "EUR", new Object[]{"Euro", 5.95}, "GBP", new Object[]{"Libra Esterlina", 7.10},
            "ARS", new Object[]{"Peso Argentino", 0.0047}, "JPY", new Object[]{"Iene Japonês", 0.036});

    public Reply reply(String method, String path, MultivaluedMap<String, String> q) {
        boolean get = "GET".equals(method);
        return switch (path) {
            case "/api/carteira" -> get ? new Reply(200, wallet(), "demo")
                    : new Reply(200, Map.of("etag", "demo"), "demo");
            case "/api/historico" -> new Reply(200, history(), null);
            case "/api/backup" -> new Reply(200, backup(), null);
            case "/api/backup/import", "/api/budget/import/preview", "/api/budget/import/commit" ->
                    new Reply(400, Map.of("error", "Indisponível no modo demonstração"), null);
            case "/api/data" -> new Reply(200, data(q.getFirst("symbols"), param(q, "range", "1y")), null);
            case "/api/crypto" -> new Reply(200, crypto(q.getFirst("coins")), null);
            case "/api/fx" -> new Reply(200, fx(Integer.parseInt(param(q, "days", "30").replaceAll("\\D", "0"))), null);
            case "/api/rates" -> new Reply(200, rates(param(q, "from", LocalDate.now().minusYears(1).toString())), null);
            case "/api/benchmarks" -> new Reply(200, benchmarks(param(q, "range", "1y"), q.getFirst("fx"), q.getFirst("crypto")), null);
            case "/api/custos" -> new Reply(200, costs(), null);
            case "/api/brapi/uso" -> new Reply(200, brapiUsage(), null);
            case "/api/budget/settings" -> get ? new Reply(200, BudgetSettings.DEFAULT, "demo")
                    : new Reply(200, Map.of("etag", "demo"), "demo");
            case "/api/budget/rules" -> get ? new Reply(200, DEMO_RULES, "demo")
                    : new Reply(200, Map.of("etag", "demo"), "demo");
            case "/api/budget/summary" -> new Reply(200, budgetSummary(q.getFirst("to"), param(q, "months", "12")), null);
            default -> {
                if (path.startsWith("/api/fipe/")) {
                    yield new Reply(200, Map.of("data", fipe(path.substring(10), q)), null);
                }
                if (path.startsWith(BUDGET_MONTHS) && yearMonth(path.substring(BUDGET_MONTHS.length())) != null) {
                    yield get ? new Reply(200, budgetMonth(yearMonth(path.substring(BUDGET_MONTHS.length()))), "demo")
                            : new Reply(200, Map.of("etag", "demo"), "demo");
                }
                yield new Reply(404, Map.of("error", "não disponível no modo demonstração"), null);
            }
        };
    }

    // ------------------------------------------------------------------ user data

    Wallet wallet() {
        LocalDate today = LocalDate.now();
        Map<String, Double> hist = new LinkedHashMap<>();
        for (int i = 2; i >= 0; i--) {
            hist.put(fipeMonth(today.minusMonths(i)), 74_800.0 - (2 - i) * 650);
        }
        String latest = fipeMonth(today);
        return new Wallet(
                List.of(new Position("ITSA4", 400.0), new Position("WEGE3", 50.0), new Position("TAEE11", 120.0),
                        new Position("HGLG11", 30.0), new Position("XPLG11", 40.0), new Position("AAPL", 5.0)),
                List.of(new Position("BTC", 0.02), new Position("ETH", 0.5)),
                List.of(new FixedIncome("demo-cdb", "CDB Banco Exemplo", "CDB", "cdi", 105.0, 15_000.0, today.minusMonths(20).toString(), today.plusYears(2).toString(), false),
                        new FixedIncome("demo-lci", "LCI Banco Fictício", "LCI", "cdi", 93.0, 8_000.0, today.minusMonths(9).toString(), today.plusMonths(15).toString(), true),
                        new FixedIncome("demo-ipca", "Tesouro IPCA+ 2032", "Tesouro IPCA+", "ipca", 5.5, 6_000.0, today.minusYears(3).toString(), "2032-08-15", false),
                        new FixedIncome("demo-pre", "Tesouro Prefixado 2029", "Tesouro Prefixado", "pre", 12.8, 5_000.0, today.minusMonths(14).toString(), "2029-01-01", false)),
                List.of(new CurrencyHolding("USD", 500.0), new CurrencyHolding("EUR", 200.0)),
                List.of(new Vehicle("demo-carro", "cars", "1", "1003", "2022-1", "Carro de exemplo",
                        new Vehicle.Info("Montadora Demo", "SUV Fictício 1.5 Turbo", 2022, "Gasolina", "000000-0"),
                        new Vehicle.LastPrice(latest, hist.get(latest)), hist)),
                Map.of("listaPainel", "ITSA4, WEGE3, TAEE11, HGLG11, XPLG11, AAPL"));
    }

    Map<String, Object> history() {
        Random r = new Random(42);
        Map<String, Object> out = new TreeMap<>();
        double invested = 96_000;
        LocalDate d = LocalDate.now().minusDays(120);
        LocalDate staleDay = previousBusinessDay(previousBusinessDay(LocalDate.now()));
        for (; !d.isAfter(LocalDate.now()); d = d.plusDays(1)) {
            if (!isBusinessDay(d)) {
                continue;
            }
            invested *= 1 + 0.0006 + 0.004 * r.nextGaussian();
            double vehicles = 74_000;
            Map<String, Object> day = new LinkedHashMap<>(Map.of("t", round(invested + vehicles), "i", round(invested), "rv", round(invested * 0.32),
                    "rf", round(invested * 0.5), "cr", round(invested * 0.12), "fx", round(invested * 0.06), "bens", vehicles));
            if (d.equals(staleDay)) {
                day.put("stale", List.of(Map.of("asset", "BTC", "since", previousBusinessDay(d).toString())));
            }
            out.put(d.toString(), day);
        }
        return out;
    }

    BudgetMonth budgetMonth(YearMonth month) {
        Random r = new Random(month.hashCode());
        List<Income> incomes = new ArrayList<>(List.of(new Income("demo-salary", month.atDay(5).toString(), "Salário", 9800.0)));
        if (month.getMonthValue() % 3 == 0) {
            incomes.add(new Income("demo-freelance", month.atDay(20).toString(), "Freelance", 1500.0 + r.nextInt(8) * 100));
        }
        List<Expense> expenses = new ArrayList<>();
        for (int i = 0; i < DEMO_EXPENSES.size(); i++) {
            DemoExpense e = DEMO_EXPENSES.get(i);
            double amount = e.fixed() ? e.amount() : Math.round(e.amount() * (0.7 + r.nextDouble() * 0.6) * 100) / 100.0;
            String date = month.atDay(Math.min(e.day(), month.lengthOfMonth())).toString();
            expenses.add(new Expense("demo-" + i, date, e.description(), amount, e.area()));
        }
        return new BudgetMonth(incomes, expenses);
    }

    List<BudgetMonthSummary> budgetSummary(String to, String months) {
        YearMonth end = to == null || yearMonth(to) == null ? YearMonth.now() : yearMonth(to);
        int count = Math.clamp(months.matches("\\d{1,2}") ? Integer.parseInt(months) : 12, 1, BudgetService.MAX_SUMMARY_MONTHS);
        List<BudgetMonthSummary> result = new ArrayList<>();
        for (int i = count - 1; i >= 0; i--) {
            YearMonth m = end.minusMonths(i);
            result.add(BudgetService.summarize(m, budgetMonth(m)));
        }
        return result;
    }

    private static YearMonth yearMonth(String text) {
        try {
            return text.matches(Formats.YEAR_MONTH) ? YearMonth.parse(text) : null;
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    Map<String, Object> backup() {
        Wallet c = wallet();
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("app", "painel-acoes");
        b.put("versao", 2);
        b.put("acoesFiis", c.stocks());
        b.put("cripto", c.crypto());
        b.put("rendaFixa", c.fixedIncome());
        b.put("moedas", c.currencies());
        b.put("bens", c.vehicles());
        b.put("historico", history());
        b.put("preferencias", c.preferences());
        return b;
    }

    // ------------------------------------------------------------------ market

    Map<String, Object> data(String symbols, String range) {
        List<StockItem> items = Tickers.parse(symbols).stream().map(t -> asset(t, range)).toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("range", range);
        out.put("items", items);
        out.put("brapi", Map.of("enabled", false));
        out.put("fetchedAt", System.currentTimeMillis());
        out.put("stale", false);
        return out;
    }

    StockItem asset(String ticker, String range) {
        boolean b3 = Tickers.isB3(ticker);
        boolean fii = b3 && ticker.endsWith("11") && !ticker.equals("TAEE11");
        double price = PRICES.getOrDefault(ticker, 5 + Math.abs(ticker.hashCode() % 2000) / 10.0);
        Random r = new Random(ticker.hashCode());
        StockItem it = new StockItem(ticker, b3 ? ticker + ".SA" : ticker);
        it.points = assetSeries(ticker, range, price, fii ? 0.008 : 0.016);
        List<Point> year = assetSeries(ticker, "1y", price, fii ? 0.008 : 0.016);
        double previous = it.points.size() > 1 ? it.points.get(it.points.size() - 2).v() : price;
        it.sources.putAll(Map.of("grafico", "demo", "cotacao", "demo", "indicadores", "demo"));
        it.type = fii ? "FII" : (b3 ? "Ação" : "Exterior");
        it.currency = b3 ? "BRL" : "USD";
        it.name = fii ? "Fundo Imobiliário Demonstração " + ticker : (b3 ? "Companhia Demonstração " + ticker : "Demo Corp. " + ticker);
        it.sector = fii ? "Fundos Imobiliários" : "Demonstração";
        it.industry = fii ? List.of("Logística", "Lajes Corporativas", "Shoppings").get(Math.abs(ticker.hashCode()) % 3) : "Dados fictícios";
        it.summary = "Ativo de demonstração: preços, proventos e indicadores são gerados e não correspondem à realidade.";
        it.price = price;
        it.change = price - previous;
        it.changePct = (price / previous - 1) * 100;
        it.open = previous * (1 + 0.003 * r.nextGaussian());
        it.prevClose = previous;
        it.dayHigh = Math.max(price, previous) * 1.006;
        it.dayLow = Math.min(price, previous) * 0.994;
        it.volume = (double) (fii ? 20_000 + r.nextInt(80_000) : 1_000_000 + r.nextInt(30_000_000));
        it.marketCap = price * (fii ? 2e7 : 1e9) * (1 + r.nextDouble());
        it.high52 = year.stream().mapToDouble(Point::v).max().orElse(price);
        it.low52 = year.stream().mapToDouble(Point::v).min().orElse(price);
        it.dividends = dividends(it.type, price * (0.6 + 0.8 * r.nextDouble()));
        long oneYearAgo = System.currentTimeMillis() - 365L * 86_400_000;
        it.div12m = it.dividends.stream().filter(d -> d.date() >= oneYearAgo).mapToDouble(Dividend::amount).sum();
        it.dy12m = it.div12m / price;
        it.fund = fii
                ? Fundamentals.fii(it.industry, it.dy12m, 0.85 + 0.2 * r.nextDouble(), it.dy12m * 1.1, it.marketCap, 5e6, 10.0 + r.nextInt(30), 0.07 + 0.02 * r.nextDouble(), 0.02 + 0.06 * r.nextDouble())
                : b3 ? Fundamentals.stock(8 + 12 * r.nextDouble(), 0.8 + 2.2 * r.nextDouble(), it.dy12m, 0.10 + 0.15 * r.nextDouble(), 0.08 + 0.12 * r.nextDouble(), 0.10 + 0.20 * r.nextDouble(), 4 + 8 * r.nextDouble(), 0.2 + r.nextDouble(), 0.05 + 0.10 * r.nextDouble(), 5e7, 1e10)
                : Fundamentals.EMPTY;
        it.pe = it.fund.pl();
        it.pvp = it.fund.pvp();
        return it;
    }

    private static List<Dividend> dividends(String type, double price) {
        List<Dividend> out = new ArrayList<>();
        int step = "FII".equals(type) ? 1 : 3;
        double amount = "FII".equals(type) ? price * 0.0075 : price * ("Exterior".equals(type) ? 0.0012 : 0.015);
        for (int m = 24; m >= 1; m -= step) {
            out.add(new Dividend(ms(LocalDate.now().minusMonths(m).withDayOfMonth(15)), round4(amount)));
        }
        return out;
    }

    Map<String, Object> crypto(String coins) {
        Map<String, Object> prices = new LinkedHashMap<>();
        for (String c : csvList(coins)) {
            if (CRYPTO.containsKey(c)) {
                prices.put(c, Map.of("price", CRYPTO.get(c), "changePct", dailyChange(c, 3)));
            }
        }
        return Map.of("prices", prices, "available", List.copyOf(CryptoService.COINS.keySet()),
                "fetchedAt", System.currentTimeMillis(), "stale", false);
    }

    Map<String, Object> fx(int days) {
        int n = Math.max(2, Math.min(days, 360));
        Map<String, Object> quotes = new LinkedHashMap<>();
        Map<String, Object> hist = new LinkedHashMap<>();
        for (String c : FxService.CODES) {
            String name = (String) CURRENCIES.get(c)[0];
            double bid = (double) CURRENCIES.get(c)[1];
            double pct = dailyChange(c, 0.6);
            quotes.put(c, Map.of("name", name, "bid", bid, "pct", pct, "high", bid * 1.004, "low", bid * 0.996,
                    "time", System.currentTimeMillis()));
            hist.put(c, randomWalk("fx-" + c, calendarDays(n), bid, 0.006));
        }
        return Map.of("quotes", quotes, "history", hist, "fetchedAt", System.currentTimeMillis(), "stale", false);
    }

    Map<String, Object> rates(String from) {
        LocalDate start;
        try {
            start = LocalDate.parse(from).withDayOfMonth(1);
        } catch (RuntimeException e) {
            return Map.of("error", "data inválida");
        }
        List<RatePoint> cdi = new ArrayList<>();
        for (LocalDate d = start; d.isBefore(LocalDate.now()); d = d.plusDays(1)) {
            if (isBusinessDay(d)) {
                cdi.add(new RatePoint(d.toString(), 0.0508));
            }
        }
        List<RatePoint> ipca = new ArrayList<>();
        Random r = new Random(7);
        for (LocalDate m = start; m.isBefore(LocalDate.now().withDayOfMonth(1)); m = m.plusMonths(1)) {
            ipca.add(new RatePoint(m.toString(), round4(0.25 + 0.3 * r.nextDouble())));
        }
        return Map.of("cdi", cdi, "ipca", ipca);
    }

    Map<String, Object> benchmarks(String range, String fx, String crypto) {
        List<LocalDate> days = rangeDays(range);
        List<Point> cdi = new ArrayList<>();
        double idx = 1;
        for (LocalDate d : days) {
            idx *= 1.000508;
            cdi.add(new Point(d.atTime(21, 0).toInstant(ZoneOffset.UTC).toEpochMilli(), idx));
        }
        Map<String, Object> indices = new LinkedHashMap<>();
        indices.put("CDI", cdi);
        indices.put("IBOV", randomWalk("ibov", days, 130_000, 0.011));
        indices.put("IFIX", randomWalk("ifix", days, 3_300, 0.005));
        Map<String, Object> currencies = new LinkedHashMap<>();
        for (String c : csvList(fx)) {
            if (CURRENCIES.containsKey(c)) {
                currencies.put(c, randomWalk("fx-" + c, days, (double) CURRENCIES.get(c)[1], 0.006));
            }
        }
        Map<String, Object> cryptoSeries = new LinkedHashMap<>();
        for (String c : csvList(crypto)) {
            if (CRYPTO.containsKey(c)) {
                cryptoSeries.put(c, randomWalk("cripto-" + c, days, CRYPTO.get(c), 0.03));
            }
        }
        @SuppressWarnings("unchecked")
        List<RatePoint> ipca = (List<RatePoint>) rates(days.get(0).toString()).get("ipca");
        return Map.of("range", range, "indices", indices, "fx", currencies, "crypto", cryptoSeries, "ipca", ipca, "warnings", List.of());
    }

    Map<String, Object> costs() {
        LocalDate today = LocalDate.now();
        List<Map<String, Object>> months = new ArrayList<>();
        double[] totals = {0.0, 0.12, 0.31, 0.28, 0.44, 0.37};
        for (int i = 0; i < 6; i++) {
            String month = today.withDayOfMonth(1).minusMonths(5 - i).toString().substring(0, 7);
            List<Map<String, Object>> services = i < 5 ? List.of() : List.of(
                    Map.of("nome", "Amazon DynamoDB", "valor", 0.21), Map.of("nome", "AWS Lambda", "valor", 0.09),
                    Map.of("nome", "Amazon Simple Storage Service", "valor", 0.05), Map.of("nome", "AWS Cost Explorer", "valor", 0.02));
            months.add(Map.of("mes", month, "total", totals[i], "servicos", services));
        }
        List<Map<String, Object>> daily = new ArrayList<>();
        for (int d = 1; d <= today.getDayOfMonth(); d++) {
            daily.add(Map.of("dia", today.withDayOfMonth(d).toString(), "valor", round4(0.005 + (d % 5) * 0.004)));
        }
        return Map.of("meses", months, "diario", daily, "previsaoMes", 0.46, "fetchedAt", System.currentTimeMillis());
    }

    Map<String, Object> brapiUsage() {
        LocalDate today = LocalDate.now();
        return Map.of("enabled", true, "plano", "free", "limite", 15_000, "usado", 3_120, "restante", 11_880,
                "janela", "rolling-30d", "inicio", today.minusDays(30) + "T00:00:00.000Z", "fim", today + "T12:00:00.000Z",
                "fetchedAt", System.currentTimeMillis());
    }

    Object fipe(String kind, MultivaluedMap<String, String> q) {
        return switch (kind) {
            case "brands" -> List.of(Map.of("code", "1", "name", "Montadora Demo"), Map.of("code", "2", "name", "Motores Exemplo"));
            case "models" -> List.of(Map.of("code", "1001", "name", "Hatch Demo 1.0"), Map.of("code", "1002", "name", "Sedã Exemplo 2.0"),
                    Map.of("code", "1003", "name", "SUV Fictício 1.5 Turbo"));
            case "years" -> List.of(Map.of("code", "2024-1", "name", "2024 Gasolina"), Map.of("code", "2022-1", "name", "2022 Gasolina"),
                    Map.of("code", "2019-1", "name", "2019 Gasolina"));
            case "price" -> {
                String key = q.getFirst("model") + q.getFirst("year");
                double base = 45_000 + Math.abs(key.hashCode() % 60_000);
                LocalDate today = LocalDate.now();
                List<Map<String, Object>> hist = new ArrayList<>();
                for (int i = 2; i >= 0; i--) {
                    hist.add(Map.of("month", fipeMonth(today.minusMonths(i)), "price", base + i * 650.0));
                }
                yield Map.of("brand", "Montadora Demo", "model", "Veículo de demonstração", "modelYear", 2022, "fuel", "Gasolina",
                        "codeFipe", "000000-0", "month", fipeMonth(today), "price", base, "history", hist);
            }
            default -> List.of();
        };
    }

    // ------------------------------------------------------------------ series

    // Random walk generated backwards: the last point is always "current"
    static List<Point> randomWalk(String key, List<LocalDate> days, double current, double vol) {
        Random r = new Random(key.hashCode());
        double[] v = new double[days.size()];
        v[v.length - 1] = current;
        for (int i = v.length - 1; i > 0; i--) {
            v[i - 1] = v[i] / (1 + 0.0008 + vol * r.nextGaussian());
        }
        List<Point> out = new ArrayList<>(v.length);
        for (int i = 0; i < v.length; i++) {
            out.add(new Point(ms(days.get(i)), round4(v[i])));
        }
        return out;
    }

    private static List<Point> assetSeries(String ticker, String range, double current, double vol) {
        return randomWalk("ativo-" + ticker, rangeDays(range), current, vol);
    }

    static List<LocalDate> rangeDays(String range) {
        return switch (range) {
            case "1mo" -> businessDays(22);
            case "3mo" -> businessDays(64);
            case "6mo" -> businessDays(126);
            case "5y" -> steps(260, 7);
            case "max" -> steps(240, 30);
            default -> businessDays(252);
        };
    }

    private static List<LocalDate> businessDays(int n) {
        List<LocalDate> out = new ArrayList<>();
        for (LocalDate d = LocalDate.now(); out.size() < n; d = d.minusDays(1)) {
            if (isBusinessDay(d)) {
                out.add(0, d);
            }
        }
        return out;
    }

    private static List<LocalDate> calendarDays(int n) {
        return steps(n, 1);
    }

    private static List<LocalDate> steps(int n, int days) {
        List<LocalDate> out = new ArrayList<>();
        for (int i = n - 1; i >= 0; i--) {
            out.add(LocalDate.now().minusDays((long) i * days));
        }
        return out;
    }

    private static boolean isBusinessDay(LocalDate d) {
        return d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY;
    }

    private static LocalDate previousBusinessDay(LocalDate d) {
        LocalDate p = d.minusDays(1);
        while (!isBusinessDay(p)) {
            p = p.minusDays(1);
        }
        return p;
    }

    private static long ms(LocalDate d) {
        return d.atTime(LocalTime.of(13, 0)).toInstant(ZoneOffset.UTC).toEpochMilli();
    }

    private static String fipeMonth(LocalDate d) {
        return MONTHS[d.getMonthValue() - 1] + " de " + d.getYear();
    }

    private static double dailyChange(String key, double amplitude) {
        Random r = new Random((key + LocalDate.now()).hashCode());
        return Math.round((r.nextDouble() * 2 - 1) * amplitude * 100) / 100.0;
    }

    private static List<String> csvList(String csv) {
        return csv == null ? List.of() : Arrays.stream(csv.split(",")).map(s -> s.strip().toUpperCase(Locale.ROOT)).filter(s -> !s.isEmpty()).toList();
    }

    private static String param(MultivaluedMap<String, String> q, String name, String fallback) {
        String v = q.getFirst(name);
        return v == null || v.isBlank() ? fallback : v;
    }

    private static double round(double v) {
        return Math.round(v * 100) / 100.0;
    }

    private static double round4(double v) {
        return Math.round(v * 10_000) / 10_000.0;
    }
}
