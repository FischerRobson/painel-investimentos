package br.com.painel.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

// Amounts in US dollars (AWS billing currency), before credits.
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CostResponse(@JsonProperty("meses") List<Month> months,
                           @JsonProperty("diario") List<Day> daily,
                           @JsonProperty("previsaoMes") Double monthForecast,
                           long fetchedAt,
                           @JsonProperty("aviso") String notice) {

    public record Month(@JsonProperty("mes") String month, double total, @JsonProperty("servicos") List<Service> services) {
    }

    public record Service(@JsonProperty("nome") String name, @JsonProperty("valor") double value) {
    }

    public record Day(@JsonProperty("dia") String day, @JsonProperty("valor") double value) {
    }
}
