package br.com.painel.snapshot;

import br.com.painel.config.AppConfig;
import br.com.painel.dto.CryptoPrice;
import br.com.painel.dto.FxQuote;
import br.com.painel.dto.RatesResponse;
import br.com.painel.model.CurrencyHolding;
import br.com.painel.model.FixedIncome;
import br.com.painel.model.KnownPrice;
import br.com.painel.model.Position;
import br.com.painel.model.PositionsDay;
import br.com.painel.model.PositionsDay.Line;
import br.com.painel.model.Snapshot;
import br.com.painel.model.Vehicle;
import br.com.painel.model.Wallet;
import br.com.painel.repository.UserDataRepository;
import br.com.painel.repository.UserDataRepository.Versioned;
import br.com.painel.service.CryptoService;
import br.com.painel.service.FipeService;
import br.com.painel.service.FxService;
import br.com.painel.service.RatesService;
import br.com.painel.service.StockService;
import br.com.painel.service.StockService.PriceQuote;
import br.com.painel.snapshot.PriceResolver.Priced;
import br.com.painel.util.B3Calendar;
import br.com.painel.util.Numbers;
import jakarta.enterprise.context.ApplicationScoped;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;
import java.util.stream.Collectors;

@ApplicationScoped
public class SnapshotService {

    // tradingDay = false: weekend or B3 holiday, nothing was saved
    public record RunSummary(String date, boolean tradingDay, int users, int saved, int failed) {
    }

    private static final Logger LOG = LoggerFactory.getLogger(SnapshotService.class);

    private final UserDataRepository repository;
    private final StockService stocks;
    private final CryptoService crypto;
    private final FxService fx;
    private final RatesService rates;
    private final FipeService fipe;
    private final ZoneId zone;
    private Clock clock = Clock.systemUTC();

    public SnapshotService(UserDataRepository repository, StockService stocks, CryptoService crypto, FxService fx,
                           RatesService rates, FipeService fipe, AppConfig config) {
        this.repository = repository;
        this.stocks = stocks;
        this.crypto = crypto;
        this.fx = fx;
        this.rates = rates;
        this.fipe = fipe;
        this.zone = ZoneId.of(config.snapshot().zone());
    }

    void useClock(Clock clock) {
        this.clock = clock;
    }

    public RunSummary takeAll() {
        LocalDate today = LocalDate.now(clock.withZone(zone));
        if (!B3Calendar.isTradingDay(today)) {
            LOG.info("Snapshot run skipped date={} reason=not-a-trading-day", today);
            return new RunSummary(today.toString(), false, 0, 0, 0);
        }
        List<String> owners = repository.owners();
        int saved = 0, failed = 0;
        for (String owner : owners) {
            try {
                if (take(owner, today).isPresent()) {
                    saved++;
                }
            } catch (RuntimeException e) {
                failed++;
                LOG.error("Snapshot failed for owner={} date={}", owner, today, e);
            }
        }
        RunSummary summary = new RunSummary(today.toString(), true, owners.size(), saved, failed);
        LOG.info("Snapshot run finished date={} users={} saved={} failed={}", summary.date(), summary.users(), saved, failed);
        return summary;
    }

    // Values the wallet: saves the day's positions (one line per holding, compared with the last saved day) and the
    // totals in historico.json. Vehicles go only into the totals (positions are investments only).
    Optional<Snapshot> take(String owner, LocalDate today) {
        Wallet wallet = repository.wallet(owner).map(Versioned::value).orElse(Wallet.EMPTY);
        if (wallet.isEmpty()) {
            LOG.info("Snapshot skipped owner={} reason=empty-wallet", owner);
            return Optional.empty();
        }
        PriceResolver prices = new PriceResolver(repository.prices(owner), today.toString());
        Map<String, FxQuote> fxQuotes = optional(fx::last);
        Optional<PositionsDay> previous = repository.positionsBefore(owner, today);
        Lines lines = new Lines(previous.map(PositionsDay::positions).orElse(List.of()));

        double stockValue = 0;
        for (Position p : wallet.stocks()) {
            String[] currency = {null};
            Priced price = prices.price("stock:" + p.ticker(), p.ticker(), () -> {
                PriceQuote q = stocks.currentPrice(p.ticker());
                currency[0] = q.currency();
                return q.price() * brlRate(fxQuotes, q.currency());
            });
            stockValue += p.quantity() * price.unit();
            lines.add("stock", "stock:" + p.ticker(), p.ticker(), p.quantity(), price.unit(), price,
                    currency[0] == null || "BRL".equals(currency[0]) ? null : currency[0], null, null);
        }

        Map<String, CryptoPrice> cryptoPrices = wallet.crypto().isEmpty() ? Map.of()
                : optional(() -> crypto.prices(wallet.crypto().stream().map(Position::ticker).toList()));
        double cryptoValue = 0;
        for (Position p : wallet.crypto()) {
            Priced price = prices.price("crypto:" + p.ticker(), p.ticker(),
                    () -> required(cryptoPrices == null ? null : cryptoPrices.get(p.ticker()), p.ticker()).price());
            cryptoValue += p.quantity() * price.unit();
            lines.add("crypto", "crypto:" + p.ticker(), p.ticker(), p.quantity(), price.unit(), price, null, null, null);
        }

        double currencyValue = 0;
        for (CurrencyHolding c : wallet.currencies()) {
            Priced price = prices.price("fx:" + c.code(), c.code(), () -> brlRate(fxQuotes, c.code()));
            currencyValue += c.quantity() * price.unit();
            lines.add("fx", "fx:" + c.code(), c.code(), c.quantity(), price.unit(), price, null, null, null);
        }

        RatesResponse rateSeries = wallet.fixedIncome().isEmpty() ? null : optional(() -> rates.rates(earliestStart(wallet)));
        double fixedIncomeValue = 0;
        for (FixedIncome f : wallet.fixedIncome()) {
            FixedIncomeCalculator.Value[] curve = {null};
            Priced price = prices.price("fixedIncome:" + f.id(), f.name(), () -> {
                curve[0] = FixedIncomeCalculator.value(f, required(rateSeries, "rates"), today);
                return curve[0].net();
            });
            fixedIncomeValue += price.unit();
            // one "share" per real invested: price = net value ÷ invested
            double unit = f.invested() > 0 ? price.unit() / f.invested() : 0;
            lines.add("fixedIncome", "fixedIncome:" + f.id(), f.name(), f.invested(), unit, price, null,
                    curve[0] == null ? null : curve[0].gross(), curve[0] == null ? null : curve[0].taxRate());
        }

        double vehicleValue = 0;
        for (Vehicle v : wallet.vehicles()) {
            KnownPrice lastFipe = v.last() != null && v.last().price() != null ? new KnownPrice(v.last().price(), v.last().month()) : null;
            vehicleValue += prices.value("vehicle:" + v.id(), v.label(), 1,
                    () -> required(fipe.price(v.type(), v.brand(), v.model(), v.year()).price(), v.id()), lastFipe);
        }

        double invested = stockValue + fixedIncomeValue + cryptoValue + currencyValue;
        String takenAt = Instant.now(clock).toString();
        Snapshot snapshot = new Snapshot(round(invested + vehicleValue), round(invested), round(stockValue), round(fixedIncomeValue),
                round(cryptoValue), round(currencyValue), round(vehicleValue), prices.stale(), prices.missing(), takenAt);
        PositionsDay day = lines.day(today.toString(), previous.map(PositionsDay::date).orElse(null), takenAt);

        if (!prices.fresh().isEmpty()) {
            repository.putPrices(owner, prices.fresh());
        }
        repository.putPositions(owner, day);
        repository.putSnapshot(owner, today.toString(), snapshot);
        LOG.info("Snapshot saved owner={} date={} total={} positions={} pnl={} stale={} missing={}", owner, today, snapshot.total(),
                day.positions().size(), day.totals().pnl(), prices.stale().size(), prices.missing().size());
        return Optional.of(snapshot);
    }

    // The day's lines, each compared with the same holding (same key) on the previous saved day
    private static final class Lines {
        private final Map<String, Line> previous;
        private final List<Line> lines = new ArrayList<>();

        Lines(List<Line> previous) {
            this.previous = previous.stream().collect(Collectors.toMap(Line::key, l -> l, (a, b) -> a));
        }

        void add(String kind, String key, String asset, double notional, double unit, Priced price, String currency, Double gross, Double taxRate) {
            Line before = previous.get(key);
            double pv = round(notional * unit);
            double ppv = before == null || before.pv() == null ? 0 : before.pv();
            Double pnl;
            if (price.missing()) {
                pnl = null; // no price today
            } else if (before == null) {
                pnl = 0.0; // not held on the previous day
            } else if (Boolean.TRUE.equals(before.missing()) || before.price() == null || before.notional() == null) {
                pnl = null; // no price on the previous day
            } else {
                pnl = round(before.notional() * (unit - before.price()));
            }
            lines.add(new Line(kind, key, asset, notional, Numbers.round(unit, 8), pv, ppv, pnl, currency,
                    gross == null ? null : round(gross), taxRate, price.staleSince(), price.missing() ? Boolean.TRUE : null));
        }

        PositionsDay day(String date, String previousDate, String takenAt) {
            double pv = lines.stream().mapToDouble(Line::pv).sum();
            double ppv = lines.stream().mapToDouble(Line::ppv).sum();
            double pnl = lines.stream().filter(l -> l.pnl() != null).mapToDouble(Line::pnl).sum();
            return new PositionsDay(date, previousDate, takenAt, lines, new PositionsDay.Totals(round(pv), round(ppv), round(pnl)));
        }
    }

    private static LocalDate earliestStart(Wallet wallet) {
        return wallet.fixedIncome().stream().map(f -> LocalDate.parse(f.start())).min(Comparator.naturalOrder()).orElseThrow();
    }

    private static double brlRate(Map<String, FxQuote> quotes, String currency) {
        if (currency == null || "BRL".equals(currency)) {
            return 1;
        }
        return required(quotes == null ? null : quotes.get(currency), currency).bid();
    }

    private static <T> T required(T value, String what) {
        if (value == null) {
            throw new IllegalStateException("no price for " + what);
        }
        return value;
    }

    private static <T> T optional(Supplier<T> call) {
        try {
            return call.get();
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static double round(double v) {
        return Numbers.round(v, 2);
    }
}
