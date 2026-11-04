package br.com.painel.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

// kind = "acao" (stock) or "fii" (real estate fund); each kind fills only its own fields. Percentages as fractions (0.0958 = 9.58%).
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Fundamentals(
        String kind,
        Double pl, Double pvp, Double dy, Double roe, Double roic,
        @JsonProperty("margemLiq") Double netMargin,
        Double evEbitda,
        @JsonProperty("divLiqPatrim") Double netDebtToEquity,
        @JsonProperty("crescRec5a") Double revenueGrowth5y,
        @JsonProperty("liquidez") Double liquidity,
        @JsonProperty("patrimLiq") Double equity,
        @JsonProperty("segmento") String segment,
        Double ffoYield,
        @JsonProperty("valorMercado") Double marketValue,
        @JsonProperty("imoveis") Double properties,
        Double capRate,
        @JsonProperty("vacancia") Double vacancy) {

    public static final String STOCK = "acao";
    public static final String FII = "fii";

    public static final Fundamentals EMPTY = new Fundamentals(null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null, null);

    public static Fundamentals stock(Double pl, Double pvp, Double dy, Double roe, Double roic, Double netMargin,
                                     Double evEbitda, Double netDebtToEquity, Double revenueGrowth5y, Double liquidity,
                                     Double equity) {
        return new Fundamentals(STOCK, pl, pvp, dy, roe, roic, netMargin, evEbitda, netDebtToEquity, revenueGrowth5y,
                liquidity, equity, null, null, null, null, null, null);
    }

    public static Fundamentals fii(String segment, Double dy, Double pvp, Double ffoYield, Double marketValue,
                                   Double liquidity, Double properties, Double capRate, Double vacancy) {
        return new Fundamentals(FII, null, pvp, dy, null, null, null, null, null, null, liquidity, null,
                segment, ffoYield, marketValue, properties, capRate, vacancy);
    }
}
