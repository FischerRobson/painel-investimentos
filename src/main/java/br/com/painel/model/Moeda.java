package br.com.painel.model;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

public record Moeda(
        @NotNull @Pattern(regexp = "USD|EUR|GBP|ARS|JPY") String c,
        @NotNull @Positive Double q) {
}
