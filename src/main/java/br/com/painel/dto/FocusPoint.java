package br.com.painel.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

// Expectativa de mercado para um ano (IPCA ou Selic de fim de ano), da última edição do Focus. Não é dado realizado.
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FocusPoint(String indicador, String ano, Double mediana, Double minimo, Double maximo) {
}
