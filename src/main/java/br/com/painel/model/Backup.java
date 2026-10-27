package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record Backup(
        @jakarta.validation.constraints.NotNull(message = "não é um backup deste painel")
        @Pattern(regexp = "painel-acoes", message = "não é um backup deste painel") String app,
        Integer versao,
        String exportadoEm,
        @Size(max = 500) List<@Valid Posicao> acoesFiis,
        @Size(max = 100) List<@Valid Posicao> cripto,
        @Size(max = 500) List<@Valid TituloRf> rendaFixa,
        @Size(max = 10) List<@Valid Moeda> moedas,
        @Size(max = 50) List<@Valid Bem> bens,
        Map<@Pattern(regexp = Datas.ISO) String, @Valid Snapshot> historico,
        String listaPainel,
        Map<String, Object> preferencias) {
}
