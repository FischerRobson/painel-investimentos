package br.com.painel.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record BudgetRules(@Size(max = 500) List<@Valid @NotNull DescriptionRule> rules) {

    public static final BudgetRules EMPTY = new BudgetRules(null);

    public BudgetRules {
        rules = rules == null ? List.of() : List.copyOf(rules);
    }
}
