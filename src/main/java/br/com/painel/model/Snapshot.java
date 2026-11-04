package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record Snapshot(
        @JsonProperty("t") @NotNull Double total,
        @JsonProperty("i") Double invested,
        @JsonProperty("rv") Double stocks,
        @JsonProperty("rf") Double fixedIncome,
        @JsonProperty("cr") Double crypto,
        @JsonProperty("fx") Double currencies,
        @JsonProperty("bens") Double vehicles,
        List<@Valid StaleQuote> stale,
        List<String> missing,
        String takenAt) {

    public Snapshot {
        stale = stale == null ? List.of() : List.copyOf(stale);
        missing = missing == null ? List.of() : List.copyOf(missing);
    }

    public record StaleQuote(String asset, String since) {
    }
}
