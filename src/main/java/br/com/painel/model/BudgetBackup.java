package br.com.painel.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;

import java.util.Map;

public record BudgetBackup(
        @Valid BudgetSettings settings,
        Map<@Pattern(regexp = Formats.YEAR_MONTH) String, @Valid BudgetMonth> months,
        @Valid BudgetRules rules) {

    public BudgetBackup {
        months = months == null ? Map.of() : Map.copyOf(months);
    }
}
