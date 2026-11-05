package br.com.painel.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.util.List;

public record BudgetMonth(
        @Size(max = 500) List<@Valid Income> incomes,
        @Size(max = 2000) List<@Valid Expense> expenses) {

    public static final BudgetMonth EMPTY = new BudgetMonth(null, null);

    public BudgetMonth {
        incomes = incomes == null ? List.of() : List.copyOf(incomes);
        expenses = expenses == null ? List.of() : List.copyOf(expenses);
    }
}
