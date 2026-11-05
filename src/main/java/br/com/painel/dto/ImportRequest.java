package br.com.painel.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ImportRequest(
        @NotNull @Size(max = 1000) List<@Valid @NotNull ImportItem> items,
        boolean includeFutureInstallments) {
}
