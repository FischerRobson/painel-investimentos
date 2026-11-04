package br.com.painel.snapshot;

import br.com.painel.config.AppConfig;
import br.com.painel.dto.CryptoPrice;
import br.com.painel.dto.FipePrice;
import br.com.painel.dto.FxQuote;
import br.com.painel.dto.RatePoint;
import br.com.painel.dto.RatesResponse;
import br.com.painel.model.CurrencyHolding;
import br.com.painel.model.FixedIncome;
import br.com.painel.model.KnownPrice;
import br.com.painel.model.Position;
import br.com.painel.model.Snapshot;
import br.com.painel.model.Snapshot.StaleQuote;
import br.com.painel.model.Vehicle;
import br.com.painel.model.Wallet;
import br.com.painel.repository.DocumentStore.Condition;
import br.com.painel.repository.FileDocumentStore;
import br.com.painel.repository.UserDataRepository;
import br.com.painel.service.CryptoService;
import br.com.painel.service.FipeService;
import br.com.painel.service.FxService;
import br.com.painel.service.RatesService;
import br.com.painel.service.StockService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SnapshotServiceTest {

    private static final String OWNER = "user-1";
    private static final LocalDate TODAY = LocalDate.parse("2026-11-04");

    @TempDir
    Path dir;

    private UserDataRepository repository;
    private boolean marketDown;

    @BeforeEach
    void setUp() {
        repository = new UserDataRepository(new FileDocumentStore(dir), new ObjectMapper());
        marketDown = false;
        repository.saveWallet(OWNER, new Wallet(
                List.of(new Position("PETR4", 10.0), new Position("AAPL", 2.0)),
                List.of(new Position("BTC", 0.5)),
                List.of(new FixedIncome("rf1", "CDB Teste", "CDB", "pre", 10.0, 1000.0, "2026-11-04", null, true)),
                List.of(new CurrencyHolding("USD", 100.0)),
                List.of(new Vehicle("car1", "cars", "1", "2", "2024-1", "Carro", null, new Vehicle.LastPrice("outubro de 2026", 80_000.0), null)),
                null), Condition.any());
    }

    @Test
    void valuesEverythingWithFreshPrices() {
        Snapshot s = service().take(OWNER, TODAY).orElseThrow();

        assertEquals(40.0 * 10 + 200.0 * 2 * 5.0, s.stocks(), 1e-9);
        assertEquals(200_000.0, s.crypto(), 1e-9);
        assertEquals(500.0, s.currencies(), 1e-9);
        assertEquals(1000.0, s.fixedIncome(), 1e-9);
        assertEquals(85_000.0, s.vehicles(), 1e-9);
        assertEquals(s.invested() + 85_000.0, s.total(), 1e-9);
        assertTrue(s.stale().isEmpty());
        assertTrue(s.missing().isEmpty());
        assertEquals(s, repository.history(OWNER).get("2026-11-04"));
        assertEquals(new KnownPrice(100_000.0 * 2, "2026-11-04").date(), repository.prices(OWNER).get("crypto:BTC").date());
    }

    @Test
    void fallsBackToPreviousPricesAndMarksThem() {
        repository.putPrices(OWNER, Map.of(
                "stock:PETR4", new KnownPrice(38.0, "2026-11-03"),
                "stock:AAPL", new KnownPrice(1000.0, "2026-11-03"),
                "crypto:BTC", new KnownPrice(390_000.0, "2026-11-03"),
                "fx:USD", new KnownPrice(5.5, "2026-11-03")));
        marketDown = true;

        Snapshot s = service().take(OWNER, TODAY).orElseThrow();

        assertEquals(38.0 * 10 + 1000.0 * 2, s.stocks(), 1e-9);
        assertEquals(195_000.0, s.crypto(), 1e-9);
        assertEquals(550.0, s.currencies(), 1e-9);
        assertEquals(80_000.0, s.vehicles(), 1e-9);
        assertEquals(List.of(new StaleQuote("PETR4", "2026-11-03"), new StaleQuote("AAPL", "2026-11-03"),
                new StaleQuote("BTC", "2026-11-03"), new StaleQuote("USD", "2026-11-03"), new StaleQuote("CDB Teste", null)
        ).subList(0, 4), s.stale().subList(0, 4));
        assertEquals(List.of("CDB Teste"), s.missing());
        assertEquals(new StaleQuote("Carro", "outubro de 2026"), s.stale().get(4));
        assertEquals("2026-11-03", repository.prices(OWNER).get("crypto:BTC").date());
    }

    @Test
    void skipsEmptyWallets() {
        repository.saveWallet("user-2", Wallet.EMPTY, Condition.any());
        assertEquals(Optional.empty(), service().take("user-2", TODAY));
    }

    @Test
    void runsForEveryUser() {
        SnapshotService service = service();
        service.useClock(Clock.fixed(TODAY.atTime(LocalTime.of(21, 0)).toInstant(ZoneOffset.UTC), ZoneOffset.UTC));
        repository.saveWallet("user-2", Wallet.EMPTY, Condition.any());

        SnapshotService.RunSummary summary = service.takeAll();

        assertEquals(new SnapshotService.RunSummary("2026-11-04", 2, 1, 0), summary);
        assertEquals(Instant.parse("2026-11-04T21:00:00Z").toString(), repository.history(OWNER).get("2026-11-04").takenAt());
    }

    private SnapshotService service() {
        StockService stocks = new StockService(null, null, null) {
            @Override
            public PriceQuote currentPrice(String ticker) {
                down();
                return "AAPL".equals(ticker) ? new PriceQuote(200.0, "USD") : new PriceQuote(40.0, "BRL");
            }
        };
        CryptoService crypto = new CryptoService(null) {
            @Override
            public Map<String, CryptoPrice> prices(List<String> symbols) {
                down();
                return Map.of("BTC", new CryptoPrice(400_000.0, 1.0));
            }
        };
        FxService fx = new FxService(null) {
            @Override
            public Map<String, FxQuote> last() {
                down();
                return Map.of("USD", new FxQuote("Dólar", 5.0, 0, 5.1, 4.9, 0));
            }
        };
        RatesService rates = new RatesService(null, new ObjectMapper(), config()) {
            @Override
            public RatesResponse rates(LocalDate start) {
                down();
                return new RatesResponse(List.of(new RatePoint("2026-11-03", 0.05)), List.of(), null);
            }
        };
        FipeService fipe = new FipeService(null) {
            @Override
            public FipePrice price(String type, String brand, String model, String year) {
                down();
                return new FipePrice("Marca", "Modelo", 2024, "Gasolina", "000", "novembro de 2026", 85_000.0, List.of());
            }
        };
        return new SnapshotService(repository, stocks, crypto, fx, rates, fipe, config());
    }

    private void down() {
        if (marketDown) {
            throw new IllegalStateException("provider down");
        }
    }

    private AppConfig config() {
        return new AppConfig() {
            public Brapi brapi() {
                return Optional::empty;
            }

            public Storage storage() {
                return null;
            }

            public Auth auth() {
                return Optional::empty;
            }

            public Snapshot snapshot() {
                return new Snapshot() {
                    public String cron() {
                        return "0 0 18 * * ?";
                    }

                    public String zone() {
                        return "America/Sao_Paulo";
                    }

                    public Optional<String> token() {
                        return Optional.empty();
                    }

                    public boolean requireToken() {
                        return false;
                    }
                };
            }

            public String ratesCacheFile() {
                return dir.resolve("rates.json").toString();
            }
        };
    }
}
