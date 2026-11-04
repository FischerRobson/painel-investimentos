package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;

public record Position(
        @JsonProperty("t") @NotNull @Pattern(regexp = "[A-Z0-9^=\\-.]{1,15}", message = "ticker inválido") String ticker,
        @JsonProperty("q") @NotNull @PositiveOrZero Double quantity) {
}
