package br.com.painel.statement;

import br.com.painel.model.PaymentMethod;

import java.time.LocalDate;
import java.time.LocalTime;

public record StatementEntry(
        LocalDate date,
        LocalTime time,
        String description,
        double amount,
        PaymentMethod method,
        String category,
        Installment installment,
        boolean cardBillPayment) {

    public boolean isOutflow() {
        return amount < 0;
    }
}
