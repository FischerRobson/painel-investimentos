package br.com.painel.model;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;

public record Posicao(
        @NotNull @Pattern(regexp = "[A-Z0-9^=\\-.]{1,15}", message = "ticker inválido") String t,
        @NotNull @PositiveOrZero Double q) {
}
