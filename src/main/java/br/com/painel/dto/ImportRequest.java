package br.com.painel.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

// source and fileName (optional) only describe the import in the "last import" record shown on the budget page
public record ImportRequest(
        @NotNull @Size(max = 1000) List<@Valid @NotNull ImportItem> items,
        boolean includeFutureInstallments,
        @Size(max = 120) String source,
        @Size(max = 200) String fileName) {

    public ImportRequest(List<ImportItem> items, boolean includeFutureInstallments) {
        this(items, includeFutureInstallments, null, null);
    }
}
