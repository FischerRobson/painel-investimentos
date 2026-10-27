package br.com.painel.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

// Valores em dólar (moeda da fatura da AWS), antes de créditos.
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CustosResponse(List<Mes> meses, List<Dia> diario, Double previsaoMes, long fetchedAt, String aviso) {

    public record Mes(String mes, double total, List<Servico> servicos) {
    }

    public record Servico(String nome, double valor) {
    }

    public record Dia(String dia, double valor) {
    }
}
