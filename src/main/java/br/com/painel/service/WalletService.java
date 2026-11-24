package br.com.painel.service;

import br.com.painel.model.Backup;
import br.com.painel.model.CurrencyHolding;
import br.com.painel.model.FixedIncome;
import br.com.painel.model.Operation;
import br.com.painel.model.Position;
import br.com.painel.model.PositionsDay;
import br.com.painel.model.Snapshot;
import br.com.painel.model.Wallet;
import br.com.painel.repository.DocumentStore.Condition;
import br.com.painel.repository.UserDataRepository;
import br.com.painel.repository.UserDataRepository.Versioned;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@ApplicationScoped
public class WalletService {

    private static final String WATCHLIST = "listaPainel";
    private static final String STOCK_TICKER = "[A-Z0-9^=\\-.]{1,15}";
    private static final Set<String> CURRENCIES = Set.of("USD", "EUR", "GBP", "ARS", "JPY");

    private final UserDataRepository repository;
    private final CurrentUser user;
    private final BudgetService budget;

    public WalletService(UserDataRepository repository, CurrentUser user, BudgetService budget) {
        this.repository = repository;
        this.user = user;
        this.budget = budget;
    }

    public Optional<Versioned<Wallet>> wallet() {
        return repository.wallet(user.id());
    }

    // The lists of the wallet only change through operations: operations already saved can't be edited or removed (a mistake
    // is reversed with an "estorno"), the entries of assets with operations are rebuilt from them (WalletLedger) and the
    // entries of assets without operations (held before the operations started) must stay as they were.
    public String save(Wallet wallet, Condition condition) {
        validate(wallet);
        Wallet previous = wallet().map(Versioned::value).orElse(Wallet.EMPTY);
        List<Operation> ops = appendOnly(previous.operations(), wallet.operations(), Instant.now().toString());
        WalletLedger.Derived d = WalletLedger.derive(ops);
        Wallet saved = new Wallet(
                fromOperations("ações e FIIs", wallet.stocks(), previous.stocks(), Position::ticker, d.governedTickers(),
                        toPositions(d.stocks())),
                fromOperations("cripto", wallet.crypto(), previous.crypto(), Position::ticker, d.governedTickers(),
                        toPositions(d.crypto())),
                fromOperations("renda fixa", wallet.fixedIncome(), previous.fixedIncome(), FixedIncome::id, d.governedBonds(),
                        d.fixedIncome()),
                fromOperations("moedas", wallet.currencies(), previous.currencies(), CurrencyHolding::code, d.governedCurrencies(),
                        toCurrencies(d.currencies())),
                wallet.vehicles(), wallet.preferences(), ops, wallet.distributions());
        return repository.saveWallet(user.id(), saved, condition);
    }

    // Keeps the order sent by the page; new operations get the time the server received them
    static List<Operation> appendOnly(List<Operation> previous, List<Operation> sent, String now) {
        Map<String, Operation> sentById = new HashMap<>();
        sent.forEach(o -> sentById.put(o.id(), o));
        Map<String, Operation> before = new HashMap<>();
        for (Operation p : previous) {
            Operation s = sentById.get(p.id());
            if (s == null || !s.withRegisteredAt(null).equals(p.withRegisteredAt(null))) {
                throw new InvalidDataException("operações já lançadas não podem ser alteradas nem apagadas: faça um estorno ("
                        + p.ticker() + " em " + p.date() + ")");
            }
            before.put(p.id(), p);
        }
        return sent.stream().map(o -> before.containsKey(o.id()) ? before.get(o.id()) : o.withRegisteredAt(now)).toList();
    }

    private static <T> List<T> fromOperations(String what, List<T> sent, List<T> previous, Function<T, String> key,
                                              Set<String> governed, Map<String, T> derived) {
        Set<T> sentFree = sent.stream().filter(x -> !governed.contains(key.apply(x))).collect(Collectors.toSet());
        Set<T> previousFree = previous.stream().filter(x -> !governed.contains(key.apply(x))).collect(Collectors.toSet());
        if (!sentFree.equals(previousFree)) {
            throw new InvalidDataException(what + ": a carteira só muda por operações (compra, venda, aplicação, resgate)");
        }
        List<T> out = new ArrayList<>();
        Set<String> placed = new HashSet<>();
        for (T x : sent) {
            String k = key.apply(x);
            if (!governed.contains(k)) {
                out.add(x);
            } else if (derived.containsKey(k) && placed.add(k)) {
                out.add(derived.get(k));
            }
        }
        derived.forEach((k, v) -> {
            if (placed.add(k)) {
                out.add(v);
            }
        });
        return out;
    }

    private static Map<String, Position> toPositions(Map<String, Double> qty) {
        Map<String, Position> out = new LinkedHashMap<>();
        qty.forEach((t, q) -> out.put(t, new Position(t, q)));
        return out;
    }

    private static Map<String, CurrencyHolding> toCurrencies(Map<String, Double> qty) {
        Map<String, CurrencyHolding> out = new LinkedHashMap<>();
        qty.forEach((c, q) -> out.put(c, new CurrencyHolding(c, q)));
        return out;
    }

    public Map<String, Snapshot> history() {
        return repository.history(user.id());
    }

    public List<String> positionDates() {
        return repository.positionDates(user.id()).stream().map(LocalDate::toString).toList();
    }

    public Optional<PositionsDay> positions(LocalDate date) {
        return repository.positions(user.id(), date);
    }

    public Backup exportBackup() {
        Wallet w = wallet().map(Versioned::value).orElse(Wallet.EMPTY);
        Object watchlist = w.preferences().get(WATCHLIST);
        return new Backup("painel-acoes", 2, Instant.now().toString(), w.stocks(), w.crypto(), w.fixedIncome(),
                w.currencies(), w.vehicles(), history(), watchlist instanceof String s ? s : null, w.preferences(),
                budget.exportBackup(), w.operations(), w.distributions());
    }

    public void importBackup(Backup b) {
        Map<String, Object> prefs = new LinkedHashMap<>(b.preferences() == null ? Map.of() : b.preferences());
        if (b.watchlist() != null && !b.watchlist().isBlank()) {
            prefs.put(WATCHLIST, b.watchlist());
        }
        Wallet wallet = new Wallet(b.stocks(), b.crypto(), b.fixedIncome(), b.currencies(), b.vehicles(), prefs,
                b.operations(), b.distributions());
        validate(wallet);
        String owner = user.id();
        budget.importBackup(b.budget());
        repository.saveWallet(owner, wallet, Condition.any());
        repository.replaceHistory(owner, b.history() == null ? Map.of() : b.history());
    }

    private void validate(Wallet w) {
        for (Position p : w.crypto()) {
            if (!CryptoService.COINS.containsKey(p.ticker())) {
                throw new InvalidDataException("cripto não suportada: " + p.ticker());
            }
        }
        Map<String, Operation> byId = new HashMap<>();
        for (Operation o : w.operations()) {
            if (byId.put(o.id(), o) != null) {
                throw new InvalidDataException("operação repetida: " + o.id());
            }
        }
        Set<String> reversed = new HashSet<>();
        for (Operation o : w.operations()) {
            String where = o.ticker() + " em " + o.date();
            if ("estorno".equals(o.type())) {
                Operation target = o.reverses() == null ? null : byId.get(o.reverses());
                if (target == null || "estorno".equals(target.type())) {
                    throw new InvalidDataException("estorno sem a operação estornada: " + where);
                }
                if (!reversed.add(target.id())) {
                    throw new InvalidDataException("operação estornada duas vezes: " + target.ticker() + " em " + target.date());
                }
                continue;
            }
            switch (o.assetClass()) {
                case "rf" -> {
                    if (!Set.of("aplicacao", "resgate").contains(o.type()) || o.quantity() == null || o.quantity() <= 0) {
                        throw new InvalidDataException("renda fixa: informe aplicação ou resgate com o valor: " + where);
                    }
                    if ("aplicacao".equals(o.type()) && o.bond() == null) {
                        throw new InvalidDataException("aplicação sem os dados do título: " + where);
                    }
                }
                case "moeda" -> {
                    if (!CURRENCIES.contains(o.ticker())) {
                        throw new InvalidDataException("moeda não suportada: " + o.ticker());
                    }
                    if (!Set.of("compra", "venda").contains(o.type()) || o.quantity() == null || o.quantity() <= 0) {
                        throw new InvalidDataException("moeda: informe compra ou venda com a quantidade: " + where);
                    }
                }
                default -> validateStockOperation(o, where);
            }
        }
    }

    private static void validateStockOperation(Operation o, String where) {
        if (!o.ticker().matches(STOCK_TICKER)) {
            throw new InvalidDataException("ticker inválido: " + o.ticker());
        }
        if ("cripto".equals(o.assetClass()) && !CryptoService.COINS.containsKey(o.ticker())) {
            throw new InvalidDataException("cripto não suportada: " + o.ticker());
        }
        if ("aplicacao".equals(o.type()) || "resgate".equals(o.type())) {
            throw new InvalidDataException(o.type() + " só vale para renda fixa: " + where);
        }
        boolean trade = "compra".equals(o.type()) || "venda".equals(o.type()) || "bonificacao".equals(o.type());
        if (trade && (o.quantity() == null || o.quantity() <= 0 || o.price() == null)) {
            throw new InvalidDataException("operação sem quantidade ou preço: " + where);
        }
        if (!trade && (o.factor() == null || o.factor() <= 0)) {
            throw new InvalidDataException("informe o fator do " + o.type() + " de " + o.ticker());
        }
    }
}
