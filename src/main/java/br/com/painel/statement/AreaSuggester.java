package br.com.painel.statement;

import br.com.painel.model.BudgetArea;
import br.com.painel.model.BudgetMonth;
import br.com.painel.model.Expense;

import java.time.YearMonth;
import java.util.HashMap;
import java.util.Map;
import java.util.SortedMap;

public final class AreaSuggester {

    private static final Map<String, BudgetArea> BY_CATEGORY = Map.ofEntries(
            Map.entry("contas", BudgetArea.FIXED_COSTS), Map.entry("moradia", BudgetArea.FIXED_COSTS),
            Map.entry("saude", BudgetArea.FIXED_COSTS), Map.entry("transporte", BudgetArea.FIXED_COSTS),
            Map.entry("mercado", BudgetArea.FIXED_COSTS), Map.entry("supermercado", BudgetArea.FIXED_COSTS),
            Map.entry("tarifas", BudgetArea.FIXED_COSTS), Map.entry("impostos", BudgetArea.FIXED_COSTS),
            Map.entry("seguros", BudgetArea.FIXED_COSTS), Map.entry("servicos", BudgetArea.FIXED_COSTS),
            Map.entry("alimentacao", BudgetArea.PLEASURES), Map.entry("lazer e entretenimento", BudgetArea.PLEASURES),
            Map.entry("restaurantes", BudgetArea.PLEASURES), Map.entry("viagem", BudgetArea.PLEASURES),
            Map.entry("viagens", BudgetArea.PLEASURES), Map.entry("educacao", BudgetArea.EDUCATION),
            Map.entry("compras", BudgetArea.COMFORT), Map.entry("casa", BudgetArea.COMFORT),
            Map.entry("vestuario", BudgetArea.COMFORT), Map.entry("beleza", BudgetArea.COMFORT),
            Map.entry("assinaturas", BudgetArea.COMFORT), Map.entry("cuidados pessoais", BudgetArea.COMFORT));

    private final Map<String, BudgetArea> byDescription = new HashMap<>();

    public AreaSuggester(SortedMap<YearMonth, BudgetMonth> history) {
        history.values().forEach(m -> {
            for (Expense e : m.expenses()) {
                byDescription.put(ImportKeys.normalize(e.description()), e.area());
            }
        });
    }

    public BudgetArea suggest(String description, String category) {
        BudgetArea learned = byDescription.get(ImportKeys.normalize(description));
        if (learned != null && learned != BudgetArea.FINANCIAL_FREEDOM) {
            return learned;
        }
        return BY_CATEGORY.getOrDefault(ImportKeys.normalize(category), BudgetArea.FIXED_COSTS);
    }
}
