package br.com.painel.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record CryptoResponse(Map<String, CryptoPrice> prices, List<String> available, String error) {
}
