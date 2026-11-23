package br.com.painel.service;

import br.com.painel.model.Backup;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@ApplicationScoped
public class WalletService {

    private static final String WATCHLIST = "listaPainel";

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

    public String save(Wallet wallet, Condition condition) {
        validate(wallet);
        return repository.saveWallet(user.id(), wallet, condition);
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
        for (Operation o : w.operations()) {
            if ("cripto".equals(o.assetClass()) && !CryptoService.COINS.containsKey(o.ticker())) {
                throw new InvalidDataException("cripto não suportada: " + o.ticker());
            }
            boolean trade = "compra".equals(o.type()) || "venda".equals(o.type()) || "bonificacao".equals(o.type());
            if (trade && (o.quantity() == null || o.quantity() <= 0 || o.price() == null)) {
                throw new InvalidDataException("operação sem quantidade ou preço: " + o.ticker() + " em " + o.date());
            }
            if (!trade && (o.factor() == null || o.factor() <= 0)) {
                throw new InvalidDataException("informe o fator do " + o.type() + " de " + o.ticker());
            }
        }
    }
}
