package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

// A dividend, JCP (interest on equity) or FII income actually received. valor: amount received in BRL;
// irRetido: tax withheld at source (JCP: 15%).
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Distribution(
        @NotBlank @Size(max = 40) String id,
        @JsonProperty("data") @NotNull @Pattern(regexp = Formats.ISO_DATE) String date,
        @JsonProperty("ativo") @NotNull @Pattern(regexp = "[A-Z0-9^=\\-.]{1,15}", message = "ticker inválido") String ticker,
        @JsonProperty("tipo") @NotNull @Pattern(regexp = "dividendo|jcp|rendimento|outro") String type,
        @JsonProperty("valor") @NotNull @PositiveOrZero Double amount,
        @JsonProperty("irRetido") @PositiveOrZero Double withheld) {
}
