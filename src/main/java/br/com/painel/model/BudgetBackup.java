package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;

import java.util.Map;

public record BudgetBackup(
        @Valid BudgetSettings settings,
        Map<@Pattern(regexp = Formats.YEAR_MONTH) String, @Valid BudgetMonth> months,
        @Valid BudgetRules rules,
        @JsonProperty("vr") @Valid Benefits benefits,
        @JsonProperty("recurring") @Valid Recurring recurring) {

    public BudgetBackup(BudgetSettings settings, Map<String, BudgetMonth> months, BudgetRules rules) {
        this(settings, months, rules, null, null);
    }

    public BudgetBackup {
        months = months == null ? Map.of() : Map.copyOf(months);
    }
}
