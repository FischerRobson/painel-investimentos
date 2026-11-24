package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

// Every change to the wallet is an operation: the lists in the wallet (acoesFiis, cripto, rendaFixa, moedas) are derived
// from them (WalletLedger) and operations are never edited or removed: a mistake is undone with an "estorno" (reversal)
// that points to the original. Rules for cost, taxes and the derivation also live in src/main/webui/src/motor/operacoes.ts.
//  - classes: acao, fii, etf, bdr, exterior, cripto (ticker in ativo), rf (fixed income: ativo is the bond id) and
//    moeda (foreign currency: ativo is USD, EUR...).
//  - types: compra/venda (stocks, crypto, currencies), desdobramento/grupamento/bonificacao (stock events),
//    aplicacao/resgate (fixed income) and estorno.
//  - qtd: units of the asset (shares, coins, currency units); in fixed income, the principal in BRL that enters or leaves.
//  - preco: unit price in the asset currency (bonificacao: cost per share set by the company); cambio: BRL per unit of
//    that currency; taxas: fees in BRL; fator: split factor (desdobramento 2 = 1 share becomes 2; grupamento 10 = 10
//    shares become 1); inicial: opening balance for a position held before the operations started.
//  - valor: BRL that left the account (compra, aplicacao, fees included) or came in (venda, resgate, net of fees and tax).
//  - valorPresente: BRL value of the position on the operation date, just before it (audit trail).
//  - registrado: when the server first received it (set by the server). estorna: id of the reversed operation.
//  - titulo: terms of a fixed income bond, on its aplicacao.
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Operation(
        @NotBlank @Size(max = 40) String id,
        @JsonProperty("data") @NotNull @Pattern(regexp = Formats.ISO_DATE) String date,
        @JsonProperty("tipo") @NotNull @Pattern(regexp = "compra|venda|desdobramento|grupamento|bonificacao|aplicacao|resgate|estorno") String type,
        @JsonProperty("classe") @NotNull @Pattern(regexp = "acao|fii|etf|bdr|exterior|cripto|rf|moeda") String assetClass,
        @JsonProperty("ativo") @NotNull @Pattern(regexp = "[A-Za-z0-9^=\\-._]{1,40}", message = "ativo inválido") String ticker,
        @JsonProperty("qtd") @PositiveOrZero Double quantity,
        @JsonProperty("preco") @PositiveOrZero Double price,
        @JsonProperty("taxas") @PositiveOrZero Double fees,
        @JsonProperty("cambio") @Positive Double fx,
        @JsonProperty("fator") @Positive Double factor,
        @JsonProperty("inicial") Boolean opening,
        @JsonProperty("obs") @Size(max = 200) String note,
        @JsonProperty("valor") @PositiveOrZero Double value,
        @JsonProperty("valorPresente") @PositiveOrZero Double presentValue,
        @JsonProperty("registrado") @Size(max = 40) String registeredAt,
        @JsonProperty("estorna") @Size(max = 40) String reverses,
        @JsonProperty("titulo") @Valid BondTerms bond) {

    public Operation(String id, String date, String type, String assetClass, String ticker, Double quantity, Double price,
                     Double fees, Double fx, Double factor, Boolean opening, String note) {
        this(id, date, type, assetClass, ticker, quantity, price, fees, fx, factor, opening, note, null, null, null, null, null);
    }

    public Operation withRegisteredAt(String at) {
        return new Operation(id, date, type, assetClass, ticker, quantity, price, fees, fx, factor, opening, note, value,
                presentValue, at, reverses, bond);
    }

    // Terms of a fixed income bond (the rest of FixedIncome comes from the operations: principal and start date)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record BondTerms(
            @JsonProperty("nome") @NotBlank @Size(max = 80) String name,
            @JsonProperty("tipo") @NotBlank @Size(max = 40) String kind,
            @JsonProperty("idx") @NotNull @Pattern(regexp = "cdi|pre|ipca") String index,
            @JsonProperty("taxa") @NotNull @PositiveOrZero Double rate,
            @JsonProperty("venc") @Pattern(regexp = Formats.ISO_DATE) String maturity,
            @JsonProperty("isento") Boolean taxExempt,
            @JsonProperty("instituicao") @Size(max = 80) String institution,
            @JsonProperty("liquidezDiaria") Boolean dailyLiquidity) {
    }
}
