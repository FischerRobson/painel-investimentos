package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record Backup(
        @NotNull(message = "não é um backup deste painel")
        @Pattern(regexp = "painel-acoes", message = "não é um backup deste painel") String app,
        @JsonProperty("versao") Integer version,
        @JsonProperty("exportadoEm") String exportedAt,
        @JsonProperty("acoesFiis") @Size(max = 500) List<@Valid Position> stocks,
        @JsonProperty("cripto") @Size(max = 100) List<@Valid Position> crypto,
        @JsonProperty("rendaFixa") @Size(max = 500) List<@Valid FixedIncome> fixedIncome,
        @JsonProperty("moedas") @Size(max = 10) List<@Valid CurrencyHolding> currencies,
        @JsonProperty("bens") @Size(max = 50) List<@Valid Vehicle> vehicles,
        @JsonProperty("historico") Map<@Pattern(regexp = Formats.ISO_DATE) String, @Valid Snapshot> history,
        @JsonProperty("listaPainel") String watchlist,
        @JsonProperty("preferencias") Map<String, Object> preferences) {
}
