package br.com.painel.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

// kind = "acao" ou "fii"; cada tipo preenche só os seus campos. Percentuais em fração (0.0958 = 9,58%).
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Fundamentals(
        String kind,
        Double pl, Double pvp, Double dy, Double roe, Double roic, Double margemLiq, Double evEbitda,
        Double divLiqPatrim, Double crescRec5a, Double liquidez, Double patrimLiq,
        String segmento, Double ffoYield, Double valorMercado, Double imoveis, Double capRate, Double vacancia) {

    public static final Fundamentals EMPTY = new Fundamentals(null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null, null);

    public static Fundamentals acao(Double pl, Double pvp, Double dy, Double roe, Double roic, Double margemLiq,
                                    Double evEbitda, Double divLiqPatrim, Double crescRec5a, Double liquidez,
                                    Double patrimLiq) {
        return new Fundamentals("acao", pl, pvp, dy, roe, roic, margemLiq, evEbitda, divLiqPatrim, crescRec5a,
                liquidez, patrimLiq, null, null, null, null, null, null);
    }

    public static Fundamentals fii(String segmento, Double dy, Double pvp, Double ffoYield, Double valorMercado,
                                   Double liquidez, Double imoveis, Double capRate, Double vacancia) {
        return new Fundamentals("fii", null, pvp, dy, null, null, null, null, null, null, liquidez, null,
                segmento, ffoYield, valorMercado, imoveis, capRate, vacancia);
    }
}
