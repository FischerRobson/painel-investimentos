package br.com.painel.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

// data: data base das taxas (AAAA-MM-DD); o Tesouro publica com alguns dias de atraso.
// stale: preenchido quando a fonte caiu e a resposta veio da última cópia salva em disco (dd/MM HH:mm).
@JsonInclude(JsonInclude.Include.NON_NULL)
public record TesouroResponse(String data, List<TesouroTitulo> titulos, String stale) {
}
