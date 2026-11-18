package br.com.painel.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

// ipca: IPCA mensal (%). cdi: CDI diário (% ao dia). selic: meta da Selic (% a.a.). focus: expectativas (null se o Focus falhar).
@JsonInclude(JsonInclude.Include.NON_NULL)
public record TermometroResponse(List<RatePoint> ipca, List<RatePoint> cdi, List<RatePoint> selic,
                                 String focusData, List<FocusPoint> focus, String focusErro) {
}
