package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public enum BudgetArea {
    @JsonProperty("fixedCosts") FIXED_COSTS,
    @JsonProperty("comfort") COMFORT,
    @JsonProperty("pleasures") PLEASURES,
    @JsonProperty("education") EDUCATION,
    @JsonProperty("financialFreedom") FINANCIAL_FREEDOM
}
