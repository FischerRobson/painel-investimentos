package br.com.painel.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

public record YahooHistory(JsonNode meta, List<Dividend> dividends, Double low52, Double high52) {
}
