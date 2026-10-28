package br.com.painel.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Consumo do plano da brapi. {@code janela} é "rolling-30d" (últimos 30 dias corridos) ou
 * "billing-cycle" (ciclo de cobrança); {@code inicio} e {@code fim} são datas ISO da janela.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record BrapiUso(boolean enabled, String plano, Long limite, Long usado, Long restante,
                       String janela, String inicio, String fim, Long fetchedAt) {

    public static final BrapiUso DESATIVADO = new BrapiUso(false, null, null, null, null, null, null, null, null);
}
