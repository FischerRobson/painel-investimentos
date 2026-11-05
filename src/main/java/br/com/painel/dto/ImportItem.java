package br.com.painel.dto;

import br.com.painel.model.BudgetArea;
import br.com.painel.model.Formats;
import br.com.painel.model.PaymentMethod;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ImportItem(
        @NotNull @Pattern(regexp = Formats.IMPORT_KEY) String key,
        @NotNull @Pattern(regexp = Formats.YEAR_MONTH) String month,
        @NotNull Type type,
        @NotNull @Pattern(regexp = Formats.ISO_DATE) String date,
        @NotBlank @Size(max = 120) String description,
        @Size(max = 120) String originalDescription,
        @NotNull @Positive @DecimalMax("100000000") Double amount,
        PaymentMethod method,
        @Size(max = 80) String category,
        @Pattern(regexp = Formats.INSTALLMENT) String installment,
        BudgetArea area,
        boolean selected,
        boolean duplicate,
        @Size(max = 200) String note,
        @Size(max = 120) List<@Valid @NotNull FutureInstallment> future) {

    public ImportItem {
        future = future == null ? List.of() : List.copyOf(future);
    }

    public enum Type {
        @JsonProperty("income") INCOME,
        @JsonProperty("expense") EXPENSE
    }

    public record FutureInstallment(
            @NotNull @Pattern(regexp = Formats.YEAR_MONTH) String month,
            @NotNull @Pattern(regexp = Formats.INSTALLMENT) String installment,
            @NotNull @Pattern(regexp = Formats.IMPORT_KEY) String key,
            boolean duplicate) {
    }
}
