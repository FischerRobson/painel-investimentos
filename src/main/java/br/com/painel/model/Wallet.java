package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

public record Wallet(
        @JsonProperty("acoesFiis") @Size(max = 500) List<@Valid Position> stocks,
        @JsonProperty("cripto") @Size(max = 100) List<@Valid Position> crypto,
        @JsonProperty("rendaFixa") @Size(max = 500) List<@Valid FixedIncome> fixedIncome,
        @JsonProperty("moedas") @Size(max = 10) List<@Valid CurrencyHolding> currencies,
        @JsonProperty("bens") @Size(max = 50) List<@Valid Vehicle> vehicles,
        @JsonProperty("preferencias") Map<String, Object> preferences) {

    public static final Wallet EMPTY = new Wallet(null, null, null, null, null, null);

    public Wallet {
        stocks = stocks == null ? List.of() : List.copyOf(stocks);
        crypto = crypto == null ? List.of() : List.copyOf(crypto);
        fixedIncome = fixedIncome == null ? List.of() : List.copyOf(fixedIncome);
        currencies = currencies == null ? List.of() : List.copyOf(currencies);
        vehicles = vehicles == null ? List.of() : List.copyOf(vehicles);
        preferences = preferences == null ? Map.of() : preferences;
    }

    @JsonIgnore
    public boolean isEmpty() {
        return stocks.isEmpty() && crypto.isEmpty() && fixedIncome.isEmpty() && currencies.isEmpty() && vehicles.isEmpty();
    }
}
