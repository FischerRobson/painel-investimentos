package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

public record CurrencyHolding(
        @JsonProperty("c") @NotNull @Pattern(regexp = "USD|EUR|GBP|ARS|JPY") String code,
        @JsonProperty("q") @NotNull @Positive Double quantity) {
}
