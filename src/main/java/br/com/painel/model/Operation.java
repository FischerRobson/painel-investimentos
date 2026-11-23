package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

// A buy, sell or corporate event (split, reverse split, bonus shares) of a stock, FII, ETF, BDR, foreign stock or crypto.
// The quantities in the wallet (acoesFiis, cripto) are kept in sync with these by the page; the tax and cost rules live in
// src/main/webui/src/motor/operacoes.ts.
//  - preco: unit price in the asset currency (bonificacao: cost per share set by the company); cambio: BRL per unit of
//    that currency (foreign assets); taxas: fees in BRL; fator: split factor (desdobramento 2 = 1 share becomes 2;
//    grupamento 10 = 10 shares become 1); inicial: opening balance typed by the user for a position bought before.
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Operation(
        @NotBlank @Size(max = 40) String id,
        @JsonProperty("data") @NotNull @Pattern(regexp = Formats.ISO_DATE) String date,
        @JsonProperty("tipo") @NotNull @Pattern(regexp = "compra|venda|desdobramento|grupamento|bonificacao") String type,
        @JsonProperty("classe") @NotNull @Pattern(regexp = "acao|fii|etf|bdr|exterior|cripto") String assetClass,
        @JsonProperty("ativo") @NotNull @Pattern(regexp = "[A-Z0-9^=\\-.]{1,15}", message = "ticker inválido") String ticker,
        @JsonProperty("qtd") @PositiveOrZero Double quantity,
        @JsonProperty("preco") @PositiveOrZero Double price,
        @JsonProperty("taxas") @PositiveOrZero Double fees,
        @JsonProperty("cambio") @Positive Double fx,
        @JsonProperty("fator") @Positive Double factor,
        @JsonProperty("inicial") Boolean opening,
        @JsonProperty("obs") @Size(max = 200) String note) {
}
