package br.com.painel.statement.parser;

import br.com.painel.statement.ParsedStatement;
import br.com.painel.statement.ParsedStatement.StatementKind;
import br.com.painel.statement.StatementEntry;
import br.com.painel.statement.document.SheetRow;
import br.com.painel.statement.document.SheetRows;
import br.com.painel.statement.document.StatementFile;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class BtgAccountSheetParser implements StatementParser {

    private static final String HEADER_DATE = "Data e hora";

    @Override
    public String name() {
        return "btg-account-sheet";
    }

    @Override
    public boolean supports(StatementFile file) {
        return file.isSpreadsheet() && file.sheet().contains(BtgTerms.ACCOUNT_TITLE) && file.sheet().contains(HEADER_DATE);
    }

    @Override
    public ParsedStatement parse(StatementFile file) {
        SheetRows sheet = file.sheet();
        String holder = null;
        Columns columns = null;
        List<StatementEntry> entries = new ArrayList<>();
        for (SheetRow row : sheet.rows()) {
            int label = row.indexOf("Cliente:");
            if (label >= 0 && holder == null) {
                holder = row.text(label + 1);
                continue;
            }
            if (row.indexOf(HEADER_DATE) >= 0) {
                columns = Columns.of(row);
                continue;
            }
            if (columns != null) {
                columns.entry(row).ifPresent(entries::add);
            }
        }
        BtgTerms.required(holder, "o nome do cliente");
        return new ParsedStatement("Extrato BTG Pactual (planilha)", StatementKind.CHECKING_ACCOUNT, holder, null, entries);
    }

    private record Columns(int date, int category, int transaction, int description, int amount) {

        static Columns of(SheetRow header) {
            return new Columns(header.indexOf(HEADER_DATE), header.indexOf("Categoria"), header.indexOf("Transação"),
                    header.indexOf("Descrição"), header.indexOf("Valor"));
        }

        Optional<StatementEntry> entry(SheetRow row) {
            Optional<LocalDateTime> when = dateTime(row.get(date));
            String desc = row.text(description);
            String tx = row.text(transaction);
            if (when.isEmpty() || desc == null || tx == null || desc.equalsIgnoreCase(BtgTerms.DAILY_BALANCE)) {
                return Optional.empty();
            }
            Optional<Double> value = amount(row.get(amount));
            if (value.isEmpty() || value.get() == 0) {
                return Optional.empty();
            }
            return Optional.of(new StatementEntry(when.get().toLocalDate(), when.get().toLocalTime(), desc, value.get(),
                    BtgTerms.method(tx), row.text(category), null, BtgTerms.isCardBillPayment(tx)));
        }

        private static Optional<LocalDateTime> dateTime(Object cell) {
            return cell instanceof LocalDateTime t ? Optional.of(t) : BtgTerms.dateTime(cell == null ? null : cell.toString());
        }

        private static Optional<Double> amount(Object cell) {
            if (cell instanceof Double d) {
                return Optional.of(Math.round(d * 100) / 100.0);
            }
            return cell == null ? Optional.empty() : BtgTerms.money(cell.toString());
        }
    }
}
