package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record Income(
        @NotNull @Pattern(regexp = Formats.ENTRY_ID) String id,
        @NotNull @Pattern(regexp = Formats.ISO_DATE) String date,
        @NotBlank @Size(max = 120) String description,
        @NotNull @Positive @DecimalMax("100000000") Double amount,
        PaymentMethod method,
        @Pattern(regexp = Formats.IMPORT_KEY) String importKey) {

    public Income(String id, String date, String description, Double amount) {
        this(id, date, description, amount, null, null);
    }
}
