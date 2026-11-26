package br.com.painel.service;

import br.com.painel.config.AppConfig;
import br.com.painel.dto.BudgetMonthSummary;
import br.com.painel.model.Benefits;
import br.com.painel.model.BudgetArea;
import br.com.painel.model.BudgetBackup;
import br.com.painel.model.BudgetMonth;
import br.com.painel.model.BudgetRules;
import br.com.painel.model.DescriptionRule;
import br.com.painel.statement.ImportKeys;
import br.com.painel.model.BudgetSettings;
import br.com.painel.model.Recurring;
import br.com.painel.model.Expense;
import br.com.painel.model.Income;
import br.com.painel.model.LastImport;
import br.com.painel.repository.DocumentStore.Condition;
import br.com.painel.repository.UserDataRepository;
import br.com.painel.repository.UserDataRepository.Versioned;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@ApplicationScoped
public class BudgetService {

    public static final int MAX_SUMMARY_MONTHS = 24;
    private static final double TARGET_TOTAL = 100.0;
    private static final double TOLERANCE = 0.01;

    private final UserDataRepository repository;
    private final CurrentUser user;
    private final ZoneId zone;

    public BudgetService(UserDataRepository repository, CurrentUser user, AppConfig config) {
        this.repository = repository;
        this.user = user;
        this.zone = ZoneId.of(config.snapshot().zone());
    }

    public Versioned<BudgetSettings> settings() {
        return repository.budgetSettings(user.id()).orElseGet(() -> new Versioned<>(BudgetSettings.DEFAULT, null));
    }

    public String saveSettings(BudgetSettings settings, Condition condition) {
        validate(settings);
        return repository.saveBudgetSettings(user.id(), settings, condition);
    }

    public Versioned<BudgetRules> rules() {
        return repository.budgetRules(user.id()).orElseGet(() -> new Versioned<>(BudgetRules.EMPTY, null));
    }

    public String saveRules(BudgetRules rules, Condition condition) {
        validate(rules);
        return repository.saveBudgetRules(user.id(), rules, condition);
    }

    public Versioned<Recurring> recurring() {
        return repository.recurring(user.id()).orElseGet(() -> new Versioned<>(Recurring.EMPTY, null));
    }

    public String saveRecurring(Recurring recurring, Condition condition) {
        validate(recurring);
        return repository.saveRecurring(user.id(), recurring, condition);
    }

    private static void validate(Recurring r) {
        Set<String> ids = new HashSet<>();
        for (Recurring.Rule rule : r.rules()) {
            if (!ids.add(rule.id())) {
                throw new InvalidDataException("lançamento recorrente repetido: " + rule.description());
            }
            if ("expense".equals(rule.kind())) {
                if (rule.area() == null) {
                    throw new InvalidDataException("escolha a área de \"" + rule.description() + "\"");
                }
                if (rule.area() == BudgetArea.FINANCIAL_FREEDOM) {
                    throw new InvalidDataException("Liberdade financeira vem dos aportes da Carteira e não recebe lançamentos manuais");
                }
            } else if (rule.area() != null) {
                throw new InvalidDataException("entrada não tem área: " + rule.description());
            }
            if (rule.end() != null && rule.end().compareTo(rule.start()) < 0) {
                throw new InvalidDataException("o fim de \"" + rule.description() + "\" é antes do começo");
            }
        }
    }

    public Versioned<Benefits> benefits() {
        return repository.benefits(user.id()).orElseGet(() -> new Versioned<>(Benefits.EMPTY, null));
    }

    public String saveBenefits(Benefits benefits, Condition condition) {
        validate(benefits);
        return repository.saveBenefits(user.id(), benefits, condition);
    }

    private static void validate(Benefits b) {
        Set<String> ids = new HashSet<>();
        for (Benefits.Account a : b.accounts()) {
            if (!ids.add(a.id())) {
                throw new InvalidDataException("conta repetida: " + a.name());
            }
        }
        for (Benefits.Movement m : b.movements()) {
            if (!ids.contains(m.account())) {
                throw new InvalidDataException("lançamento de uma conta que não existe: " + m.description());
            }
            if (!"ajuste".equals(m.type()) && !(m.amount() > 0)) {
                throw new InvalidDataException("o valor precisa ser maior que zero: " + m.description());
            }
        }
    }

    public Optional<Versioned<BudgetMonth>> month(YearMonth month) {
        return repository.budgetMonth(user.id(), month);
    }

    public String saveMonth(YearMonth month, BudgetMonth data, Condition condition) {
        validate(data);
        return repository.saveBudgetMonth(user.id(), month, data, condition);
    }

    public List<BudgetMonthSummary> summary(YearMonth to, int count) {
        String owner = user.id();
        List<BudgetMonthSummary> result = new ArrayList<>();
        for (int i = Math.clamp(count, 1, MAX_SUMMARY_MONTHS) - 1; i >= 0; i--) {
            YearMonth m = to.minusMonths(i);
            BudgetMonth data = repository.budgetMonth(owner, m).map(Versioned::value).orElse(BudgetMonth.EMPTY);
            result.add(summarize(m, data));
        }
        return result;
    }

    public YearMonth currentMonth() {
        return YearMonth.now(zone);
    }

    public BudgetBackup exportBackup() {
        String owner = user.id();
        Map<String, BudgetMonth> months = new LinkedHashMap<>();
        for (YearMonth m : repository.budgetMonths(owner)) {
            repository.budgetMonth(owner, m).ifPresent(v -> months.put(m.toString(), v.value()));
        }
        BudgetSettings settings = repository.budgetSettings(owner).map(Versioned::value).orElse(null);
        BudgetRules rules = repository.budgetRules(owner).map(Versioned::value).orElse(null);
        Benefits benefits = repository.benefits(owner).map(Versioned::value).orElse(null);
        Recurring recurring = repository.recurring(owner).map(Versioned::value).orElse(null);
        LastImport lastImport = repository.lastImport(owner).orElse(null);
        return new BudgetBackup(settings, months, rules, benefits, recurring, lastImport);
    }

    public void importBackup(BudgetBackup backup) {
        if (backup == null) {
            return;
        }
        if (backup.settings() != null) {
            validate(backup.settings());
        }
        backup.months().values().forEach(this::validate);
        if (backup.rules() != null) {
            validate(backup.rules());
        }
        if (backup.benefits() != null) {
            validate(backup.benefits());
        }
        if (backup.recurring() != null) {
            validate(backup.recurring());
        }
        String owner = user.id();
        if (backup.settings() != null) {
            repository.saveBudgetSettings(owner, backup.settings(), Condition.any());
        }
        backup.months().forEach((m, data) -> repository.saveBudgetMonth(owner, YearMonth.parse(m), data, Condition.any()));
        if (backup.rules() != null) {
            repository.saveBudgetRules(owner, backup.rules(), Condition.any());
        }
        if (backup.benefits() != null) {
            repository.saveBenefits(owner, backup.benefits(), Condition.any());
        }
        if (backup.recurring() != null) {
            repository.saveRecurring(owner, backup.recurring(), Condition.any());
        }
        if (backup.lastImport() != null) {
            repository.saveLastImport(owner, backup.lastImport());
        }
    }

    public static BudgetMonthSummary summarize(YearMonth month, BudgetMonth data) {
        Map<BudgetArea, Double> areas = new EnumMap<>(BudgetArea.class);
        for (BudgetArea a : BudgetArea.values()) {
            areas.put(a, 0.0);
        }
        for (Expense e : data.expenses()) {
            areas.merge(e.area(), e.amount(), Double::sum);
        }
        areas.replaceAll((a, v) -> round(v));
        double income = data.incomes().stream().mapToDouble(Income::amount).sum();
        double expenses = data.expenses().stream().mapToDouble(Expense::amount).sum();
        return new BudgetMonthSummary(month.toString(), round(income), round(expenses), areas);
    }

    private static void validate(BudgetSettings settings) {
        if (!settings.targets().keySet().containsAll(Set.of(BudgetArea.values()))) {
            throw new InvalidDataException("informe a meta de todas as áreas");
        }
        double total = settings.targets().values().stream().mapToDouble(Double::doubleValue).sum();
        if (Math.abs(total - TARGET_TOTAL) > TOLERANCE) {
            throw new InvalidDataException("as metas precisam somar 100% (hoje somam " + round(total) + "%)");
        }
    }

    private void validate(BudgetMonth data) {
        Set<String> ids = new HashSet<>();
        for (Income i : data.incomes()) {
            checkEntry(ids, i.id(), i.date());
        }
        for (Expense e : data.expenses()) {
            checkEntry(ids, e.id(), e.date());
            if (e.area() == BudgetArea.FINANCIAL_FREEDOM) {
                throw new InvalidDataException("Liberdade financeira vem dos aportes da Carteira e não recebe lançamentos manuais");
            }
        }
    }

    private static void validate(BudgetRules rules) {
        Set<String> ids = new HashSet<>();
        Set<String> matches = new HashSet<>();
        for (DescriptionRule r : rules.rules()) {
            if (!ids.add(r.id())) {
                throw new InvalidDataException("regra repetida: " + r.id());
            }
            String match = ImportKeys.normalize(r.match());
            if (match.length() < 3) {
                throw new InvalidDataException("o trecho da regra precisa ter pelo menos 3 letras ou números");
            }
            if (!matches.add(match)) {
                throw new InvalidDataException("já existe uma regra para \"" + r.match() + "\"");
            }
            if (r.area() == BudgetArea.FINANCIAL_FREEDOM) {
                throw new InvalidDataException("Liberdade financeira vem dos aportes da Carteira e não recebe lançamentos manuais");
            }
        }
    }

    private static void checkEntry(Set<String> ids, String id, String date) {
        if (!ids.add(id)) {
            throw new InvalidDataException("lançamento repetido: " + id);
        }
        try {
            LocalDate.parse(date);
        } catch (DateTimeParseException e) {
            throw new InvalidDataException("data inválida: " + date);
        }
    }

    private static double round(double v) {
        return Math.round(v * 100) / 100.0;
    }
}
