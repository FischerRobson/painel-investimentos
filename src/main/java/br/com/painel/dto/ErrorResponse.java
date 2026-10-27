package br.com.painel.dto;

// Erros de fontes externas voltam com HTTP 200 e este corpo: a página mostra a mensagem em vez de quebrar.
public record ErrorResponse(String error) {
}
