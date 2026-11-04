package br.com.painel.snapshot;

import br.com.painel.config.AppConfig;
import br.com.painel.dto.CryptoPrice;
import br.com.painel.dto.FxQuote;
import br.com.painel.dto.RatesResponse;
import br.com.painel.model.CurrencyHolding;
import br.com.painel.model.FixedIncome;
import br.com.painel.model.KnownPrice;
import br.com.painel.model.Position;
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
import br.com.painel.util.Numbers;
import jakarta.enterprise.context.ApplicationScoped;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

@ApplicationScoped
public class SnapshotService {

    public record RunSummary(String date, int users, int saved, int failed) {
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
        RunSummary summary = new RunSummary(today.toString(), owners.size(), saved, failed);
        LOG.info("Snapshot run finished date={} users={} saved={} failed={}", summary.date(), summary.users(), saved, failed);
        return summary;
    }

    Optional<Snapshot> take(String owner, LocalDate today) {
        Wallet wallet = repository.wallet(owner).map(Versioned::value).orElse(Wallet.EMPTY);
        if (wallet.isEmpty()) {
            LOG.info("Snapshot skipped owner={} reason=empty-wallet", owner);
            return Optional.empty();
        }
        PriceResolver prices = new PriceResolver(repository.prices(owner), today.toString());
        Map<String, FxQuote> fxQuotes = optional(fx::last);

        double stockValue = 0;
        for (Position p : wallet.stocks()) {
            stockValue += prices.value("stock:" + p.ticker(), p.ticker(), p.quantity(), () -> {
                PriceQuote q = stocks.currentPrice(p.ticker());
                return q.price() * brlRate(fxQuotes, q.currency());
            });
        }

        Map<String, CryptoPrice> cryptoPrices = wallet.crypto().isEmpty() ? Map.of()
                : optional(() -> crypto.prices(wallet.crypto().stream().map(Position::ticker).toList()));
        double cryptoValue = 0;
        for (Position p : wallet.crypto()) {
            cryptoValue += prices.value("crypto:" + p.ticker(), p.ticker(), p.quantity(),
                    () -> required(cryptoPrices == null ? null : cryptoPrices.get(p.ticker()), p.ticker()).price());
        }

        double currencyValue = 0;
        for (CurrencyHolding c : wallet.currencies()) {
            currencyValue += prices.value("fx:" + c.code(), c.code(), c.quantity(), () -> brlRate(fxQuotes, c.code()));
        }

        RatesResponse rateSeries = wallet.fixedIncome().isEmpty() ? null : optional(() -> rates.rates(earliestStart(wallet)));
        double fixedIncomeValue = 0;
        for (FixedIncome f : wallet.fixedIncome()) {
            fixedIncomeValue += prices.value("fixedIncome:" + f.id(), f.name(), 1,
                    () -> FixedIncomeCalculator.netValue(f, required(rateSeries, "rates"), today));
        }

        double vehicleValue = 0;
        for (Vehicle v : wallet.vehicles()) {
            KnownPrice lastFipe = v.last() != null && v.last().price() != null ? new KnownPrice(v.last().price(), v.last().month()) : null;
            vehicleValue += prices.value("vehicle:" + v.id(), v.label(), 1,
                    () -> required(fipe.price(v.type(), v.brand(), v.model(), v.year()).price(), v.id()), lastFipe);
        }

        double invested = stockValue + fixedIncomeValue + cryptoValue + currencyValue;
        Snapshot snapshot = new Snapshot(round(invested + vehicleValue), round(invested), round(stockValue), round(fixedIncomeValue),
                round(cryptoValue), round(currencyValue), round(vehicleValue), prices.stale(), prices.missing(), Instant.now(clock).toString());

        if (!prices.fresh().isEmpty()) {
            repository.putPrices(owner, prices.fresh());
        }
        repository.putSnapshot(owner, today.toString(), snapshot);
        LOG.info("Snapshot saved owner={} date={} total={} stale={} missing={}", owner, today, snapshot.total(),
                prices.stale().size(), prices.missing().size());
        return Optional.of(snapshot);
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
