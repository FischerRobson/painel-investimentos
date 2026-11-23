package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;

// Benefit cards (vale-refeição, vale-alimentação...) kept as accounts: users/{sub}/budget/vr.json.
// The balance is openingBalance (on startDate) plus credits and refunds, minus spending, plus adjustments (signed).
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Benefits(
        @JsonProperty("contas") @Size(max = 10) List<@Valid @NotNull Account> accounts,
        @JsonProperty("movimentos") @Size(max = 20000) List<@Valid @NotNull Movement> movements) {

    public static final Benefits EMPTY = new Benefits(null, null);

    public Benefits {
        accounts = accounts == null ? List.of() : List.copyOf(accounts);
        movements = movements == null ? List.of() : List.copyOf(movements);
    }

    // creditoMensal/diaCredito: the monthly credit the page reminds you to record
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Account(
            @NotBlank @Size(max = 40) String id,
            @JsonProperty("nome") @NotBlank @Size(max = 40) String name,
            @JsonProperty("creditoMensal") @PositiveOrZero Double monthlyCredit,
            @JsonProperty("diaCredito") @Min(1) @Max(31) Integer creditDay,
            @JsonProperty("saldoInicial") @NotNull Double openingBalance,
            @JsonProperty("dataInicio") @NotNull @Pattern(regexp = Formats.ISO_DATE) String startDate) {
    }

    // tipo: credito (benefit deposited), gasto, estorno (refund of a purchase) or ajuste (signed correction to match the
    // balance shown by the card's app)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Movement(
            @NotBlank @Size(max = 40) String id,
            @JsonProperty("conta") @NotBlank @Size(max = 40) String account,
            @JsonProperty("data") @NotNull @Pattern(regexp = Formats.ISO_DATE) String date,
            @JsonProperty("tipo") @NotNull @Pattern(regexp = "credito|gasto|estorno|ajuste") String type,
            @JsonProperty("descricao") @Size(max = 120) String description,
            @JsonProperty("valor") @NotNull Double amount,
            @JsonProperty("categoria") @Size(max = 40) String category) {
    }
}
