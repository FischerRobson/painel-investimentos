package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record BudgetSettings(
        @NotNull Map<@NotNull BudgetArea, @NotNull @PositiveOrZero @Max(100) Double> targets,
        @Positive @DecimalMax("100000000") Double referenceIncome) {

    public static final BudgetSettings DEFAULT = new BudgetSettings(Map.of(
            BudgetArea.FIXED_COSTS, 50.0,
            BudgetArea.COMFORT, 10.0,
            BudgetArea.PLEASURES, 10.0,
            BudgetArea.EDUCATION, 5.0,
            BudgetArea.FINANCIAL_FREEDOM, 25.0));

    public BudgetSettings {
        targets = targets == null || targets.isEmpty() ? Map.of() : Collections.unmodifiableMap(new EnumMap<>(targets));
    }

    public BudgetSettings(Map<BudgetArea, Double> targets) {
        this(targets, null);
    }
}
