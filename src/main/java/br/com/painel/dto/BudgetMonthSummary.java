package br.com.painel.dto;

import br.com.painel.model.BudgetArea;

import java.util.Map;

public record BudgetMonthSummary(String month, double income, double expenses, Map<BudgetArea, Double> areas) {
}
