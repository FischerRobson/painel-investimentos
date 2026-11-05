package br.com.painel.service;

import br.com.painel.dto.ImportItem;
import br.com.painel.dto.ImportItem.FutureInstallment;
import br.com.painel.dto.ImportItem.Type;
import br.com.painel.dto.ImportPreview;
import br.com.painel.dto.ImportRequest;
import br.com.painel.dto.ImportResult;
import br.com.painel.model.BudgetArea;
import br.com.painel.model.BudgetMonth;
import br.com.painel.model.Expense;
import br.com.painel.model.Income;
import br.com.painel.repository.DocumentStore.Condition;
import br.com.painel.repository.UserDataRepository;
import br.com.painel.repository.UserDataRepository.Versioned;
import br.com.painel.model.DescriptionRule;
import br.com.painel.statement.AreaSuggester;
import br.com.painel.statement.DescriptionRules;
import br.com.painel.statement.ImportKeys;
import br.com.painel.statement.Installment;
import br.com.painel.statement.ParsedStatement;
import br.com.painel.statement.ParsedStatement.StatementKind;
import br.com.painel.statement.StatementEntry;
import br.com.painel.statement.document.StatementFile;
import br.com.painel.statement.parser.StatementParsers;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Predicate;
import java.util.stream.Stream;

@ApplicationScoped
public class StatementImportService {

    public static final int MAX_FILE_BYTES = 5 * 1024 * 1024;
    private static final int HISTORY_MONTHS = 6;
    private static final int MAX_DESCRIPTION = 120;

    private final StatementParsers parsers;
    private final UserDataRepository repository;
    private final BudgetService budget;
    private final CurrentUser user;

    public StatementImportService(StatementParsers parsers, UserDataRepository repository, BudgetService budget, CurrentUser user) {
        this.parsers = parsers;
        this.repository = repository;
        this.budget = budget;
        this.user = user;
    }

    private record Rule(Predicate<Draft> applies, String note) {
    }

    private static final List<Rule> SKIP_RULES = List.of(
            new Rule(d -> d.entry.cardBillPayment(),
                    "Pagamento da fatura do cartão: os gastos entram ao importar a fatura"),
            new Rule(d -> d.ownTransfer && d.entry.isOutflow(),
                    "Transferência para você mesmo (outra conta ou investimento)"),
            new Rule(d -> d.ownTransfer && !d.entry.isOutflow(),
                    "Dinheiro vindo de outra conta sua ou de investimentos"),
            new Rule(d -> d.statement.kind() == StatementKind.CREDIT_CARD && !d.entry.isOutflow(),
                    "Estorno ou crédito no cartão"));

    private static final class Draft {
        final ParsedStatement statement;
        final StatementEntry entry;
        final ImportKeys.Key key;
        final YearMonth month;
        final boolean ownTransfer;

        Draft(ParsedStatement statement, StatementEntry entry, ImportKeys.Key key) {
            this.statement = statement;
            this.entry = entry;
            this.key = key;
            this.month = statement.billingMonth() != null ? statement.billingMonth() : YearMonth.from(entry.date());
            this.ownTransfer = ImportKeys.normalize(entry.description()).equals(ImportKeys.normalize(statement.holder()));
        }

        Stream<FutureDraft> future() {
            Installment current = entry.installment();
            if (current == null || !entry.isOutflow() || !current.hasNext()) {
                return Stream.empty();
            }
            return Stream.iterate(current.number() + 1, n -> n <= current.total(), n -> n + 1)
                    .map(n -> new Installment(n, current.total()))
                    .map(i -> new FutureDraft(month.plusMonths(i.number() - current.number()), i, key.forInstallment(i)));
        }
    }

    private record FutureDraft(YearMonth month, Installment installment, String key) {
    }

    public ImportPreview preview(String fileName, byte[] content) {
        if (content == null || content.length == 0) {
            throw new InvalidDataException("o arquivo está vazio");
        }
        if (content.length > MAX_FILE_BYTES) {
            throw new InvalidDataException("o arquivo passa de 5 MB");
        }
        ParsedStatement statement = parsers.parse(new StatementFile(fileName, content));
        ImportKeys keys = new ImportKeys(statement.kind());
        List<Draft> drafts = statement.entries().stream().map(e -> new Draft(statement, e, keys.next(e))).toList();

        Set<YearMonth> targets = new HashSet<>();
        drafts.forEach(d -> {
            targets.add(d.month);
            d.future().forEach(f -> targets.add(f.month()));
        });
        YearMonth first = targets.stream().min(YearMonth::compareTo).orElseThrow();
        YearMonth last = targets.stream().max(YearMonth::compareTo).orElseThrow();
        TreeMap<YearMonth, BudgetMonth> loaded = load(first.minusMonths(HISTORY_MONTHS), last);
        Set<String> knownKeys = new HashSet<>();
        loaded.values().forEach(m -> knownKeys.addAll(keysOf(m)));
        AreaSuggester areas = new AreaSuggester(loaded);
        DescriptionRules rules = new DescriptionRules(budget.rules().value());

        List<ImportItem> items = drafts.stream().map(d -> item(d, knownKeys, areas, rules)).toList();
        return new ImportPreview(statement.source(),
                statement.kind() == StatementKind.CREDIT_CARD ? "creditCard" : "checkingAccount",
                statement.billingMonth() == null ? null : statement.billingMonth().toString(), items);
    }

    public ImportResult commit(ImportRequest request) {
        Map<YearMonth, List<ImportItem>> byMonth = new TreeMap<>();
        for (ImportItem item : request.items()) {
            if (item.type() == Type.EXPENSE && item.area() == null) {
                throw new InvalidDataException("escolha a área de \"" + item.description() + "\"");
            }
            byMonth.computeIfAbsent(YearMonth.parse(item.month()), m -> new ArrayList<>()).add(item);
            if (request.includeFutureInstallments() && item.type() == Type.EXPENSE) {
                for (FutureInstallment f : item.future()) {
                    byMonth.computeIfAbsent(YearMonth.parse(f.month()), m -> new ArrayList<>())
                            .add(new ImportItem(f.key(), f.month(), item.type(), item.date(), item.description(), null, item.amount(),
                                    item.method(), item.category(), f.installment(), item.area(), true, false, null, null));
                }
            }
        }
        String owner = user.id();
        int imported = 0, skipped = 0;
        List<String> months = new ArrayList<>();
        for (var e : byMonth.entrySet()) {
            Optional<Versioned<BudgetMonth>> current = repository.budgetMonth(owner, e.getKey());
            BudgetMonth data = current.map(Versioned::value).orElse(BudgetMonth.EMPTY);
            Set<String> known = keysOf(data);
            List<Income> incomes = new ArrayList<>(data.incomes());
            List<Expense> expenses = new ArrayList<>(data.expenses());
            int before = imported;
            for (ImportItem item : e.getValue()) {
                if (!known.add(item.key())) {
                    skipped++;
                    continue;
                }
                if (item.type() == Type.INCOME) {
                    incomes.add(new Income(item.key(), item.date(), item.description(), item.amount(), item.method(), item.key()));
                } else {
                    expenses.add(new Expense(item.key(), item.date(), item.description(), item.amount(), item.area(),
                            item.method(), item.installment(), item.key()));
                }
                imported++;
            }
            if (imported > before) {
                Condition condition = current.map(v -> Condition.matches(v.etag())).orElse(Condition.absent());
                budget.saveMonth(e.getKey(), new BudgetMonth(incomes, expenses), condition);
                months.add(e.getKey().toString());
            }
        }
        return new ImportResult(imported, skipped, months);
    }

    private ImportItem item(Draft d, Set<String> knownKeys, AreaSuggester areas, DescriptionRules rules) {
        StatementEntry e = d.entry;
        String key = d.key.forInstallment(e.installment());
        boolean duplicate = knownKeys.contains(key);
        Optional<String> skip = SKIP_RULES.stream().filter(r -> r.applies.test(d)).map(Rule::note).findFirst();
        Type type = e.isOutflow() ? Type.EXPENSE : Type.INCOME;
        List<FutureInstallment> future = d.future()
                .map(f -> new FutureInstallment(f.month().toString(), f.installment().toString(), f.key(), knownKeys.contains(f.key())))
                .toList();
        String original = truncate(e.description());
        Optional<DescriptionRule> rule = rules.match(e.description());
        String description = rule.map(DescriptionRule::description).orElse(original);
        BudgetArea area = type != Type.EXPENSE ? null
                : rule.map(DescriptionRule::area).orElseGet(() -> areas.suggest(description, e.category()));
        return new ImportItem(key, d.month.toString(), type, e.date().toString(), description,
                rule.isPresent() ? original : null, Math.abs(e.amount()),
                e.method(), e.category(), e.installment() == null ? null : e.installment().toString(), area,
                !duplicate && skip.isEmpty(), duplicate, duplicate ? "Já importado antes" : skip.orElse(null), future);
    }

    private static String truncate(String text) {
        return text.length() > MAX_DESCRIPTION ? text.substring(0, MAX_DESCRIPTION) : text;
    }

    private TreeMap<YearMonth, BudgetMonth> load(YearMonth from, YearMonth to) {
        String owner = user.id();
        TreeMap<YearMonth, BudgetMonth> result = new TreeMap<>();
        Set<YearMonth> stored = new HashSet<>(repository.budgetMonths(owner));
        for (YearMonth m = from; !m.isAfter(to); m = m.plusMonths(1)) {
            if (stored.contains(m)) {
                YearMonth month = m;
                repository.budgetMonth(owner, m).ifPresent(v -> result.put(month, v.value()));
            }
        }
        return result;
    }

    private static Set<String> keysOf(BudgetMonth m) {
        Set<String> keys = new HashSet<>();
        m.incomes().stream().map(Income::importKey).filter(Objects::nonNull).forEach(keys::add);
        m.expenses().stream().map(Expense::importKey).filter(Objects::nonNull).forEach(keys::add);
        return keys;
    }
}
