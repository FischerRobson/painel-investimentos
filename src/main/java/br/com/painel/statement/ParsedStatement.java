package br.com.painel.statement;

import java.time.YearMonth;
import java.util.List;

public record ParsedStatement(
        String source,
        StatementKind kind,
        String holder,
        YearMonth billingMonth,
        List<StatementEntry> entries) {

    public ParsedStatement {
        entries = List.copyOf(entries);
    }

    public enum StatementKind { CHECKING_ACCOUNT, CREDIT_CARD }
}
