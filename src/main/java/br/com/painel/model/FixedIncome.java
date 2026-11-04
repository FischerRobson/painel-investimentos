package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record FixedIncome(
        @NotBlank @Size(max = 40) String id,
        @JsonProperty("nome") @NotBlank @Size(max = 80) String name,
        @JsonProperty("tipo") @NotBlank @Size(max = 40) String kind,
        @JsonProperty("idx") @NotNull @Pattern(regexp = "cdi|pre|ipca") String index,
        @JsonProperty("taxa") @NotNull @PositiveOrZero Double rate,
        @JsonProperty("aplicado") @NotNull @PositiveOrZero Double invested,
        @JsonProperty("data") @NotNull @Pattern(regexp = Formats.ISO_DATE) String start,
        @JsonProperty("venc") @Pattern(regexp = Formats.ISO_DATE) String maturity,
        @JsonProperty("isento") boolean taxExempt) {
}
