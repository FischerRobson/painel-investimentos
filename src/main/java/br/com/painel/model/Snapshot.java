package br.com.painel.model;

import jakarta.validation.constraints.NotNull;

public record Snapshot(@NotNull Double t, Double i, Double rv, Double rf, Double cr, Double fx, Double bens) {
}
