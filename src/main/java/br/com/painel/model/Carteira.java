package br.com.painel.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

public record Carteira(
        @Size(max = 500) List<@Valid Posicao> acoesFiis,
        @Size(max = 100) List<@Valid Posicao> cripto,
        @Size(max = 500) List<@Valid TituloRf> rendaFixa,
        @Size(max = 10) List<@Valid Moeda> moedas,
        @Size(max = 50) List<@Valid Bem> bens,
        Map<String, Object> preferencias) {

    public Carteira {
        acoesFiis = acoesFiis == null ? List.of() : List.copyOf(acoesFiis);
        cripto = cripto == null ? List.of() : List.copyOf(cripto);
        rendaFixa = rendaFixa == null ? List.of() : List.copyOf(rendaFixa);
        moedas = moedas == null ? List.of() : List.copyOf(moedas);
        bens = bens == null ? List.of() : List.copyOf(bens);
        preferencias = preferencias == null ? Map.of() : preferencias;
    }
}
