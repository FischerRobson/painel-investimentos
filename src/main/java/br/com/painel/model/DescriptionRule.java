package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record DescriptionRule(
        @NotNull @Pattern(regexp = Formats.ENTRY_ID) String id,
        @NotBlank @Size(max = 80) String match,
        @NotBlank @Size(max = 120) String description,
        BudgetArea area) {
}
