package br.com.painel.statement.parser;

import br.com.painel.model.PaymentMethod;
import br.com.painel.statement.Installment;
import br.com.painel.statement.ParsedStatement;
import br.com.painel.statement.ParsedStatement.StatementKind;
import br.com.painel.statement.StatementEntry;
import br.com.painel.statement.document.PdfLine;
import br.com.painel.statement.document.StatementFile;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@ApplicationScoped
public class NubankCardStatementParser implements StatementParser {

    private static final String MONTH = "(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)";
    private static final String AMOUNT = "[−-]?\\s?R\\$\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
    private static final Pattern DUE_DATE = Pattern.compile(
            "Data de vencimento: \\d{2} (" + MONTH + ") (\\d{4})", Pattern.CASE_INSENSITIVE);
    private static final Pattern HEADER = Pattern.compile("^FATURA \\d{2} " + MONTH + " \\d{4}", Pattern.CASE_INSENSITIVE);
    private static final Pattern ITEM = Pattern.compile(
            "^(\\d{2}) (" + MONTH + ") (?:•+\\s?\\d{4} )?(.+?) (" + AMOUNT + ")$", Pattern.CASE_INSENSITIVE);
    private static final Pattern INSTALLMENT = Pattern.compile("\\s*-\\s*Parcela (\\d{1,3})/(\\d{1,3})$", Pattern.CASE_INSENSITIVE);

    private enum Section { NONE, CARD, OTHER }

    @Override
    public String name() {
        return "nubank-card-pdf";
    }

    @Override
    public boolean supports(StatementFile file) {
        return file.isPdf() && file.pdf().contains("Nu Pagamentos S.A.")
                && file.pdf().lines().stream().anyMatch(l -> DUE_DATE.matcher(l.text()).find());
    }

    @Override
    public ParsedStatement parse(StatementFile file) {
        List<PdfLine> lines = file.pdf().lines();
        Matcher due = lines.stream().map(l -> DUE_DATE.matcher(l.text())).filter(Matcher::find).findFirst().orElseThrow();
        YearMonth billing = YearMonth.of(Integer.parseInt(due.group(2)), month(due.group(1)));
        String holder = holder(lines);
        List<StatementEntry> entries = new ArrayList<>();
        Section section = Section.NONE;
        for (PdfLine line : lines) {
            String text = line.text();
            if (BtgTerms.fold(text).startsWith("transacoes")) {
                section = Section.CARD;
            } else if (text.startsWith("Pagamentos e Financiamentos")) {
                section = Section.OTHER;
            } else if (section != Section.NONE) {
                item(text, section, billing).ifPresent(entries::add);
            }
        }
        return new ParsedStatement("Fatura do cartão Nubank", StatementKind.CREDIT_CARD, holder, billing, entries);
    }

    private static String holder(List<PdfLine> lines) {
        for (int i = 1; i < lines.size(); i++) {
            if (HEADER.matcher(lines.get(i).text()).find()) {
                return BtgTerms.required(lines.get(i - 1).text(), "o nome do titular");
            }
        }
        return BtgTerms.required(null, "o nome do titular");
    }

    private static Optional<StatementEntry> item(String text, Section section, YearMonth billing) {
        Matcher m = ITEM.matcher(text);
        if (!m.find()) {
            return Optional.empty();
        }
        String description = m.group(3).strip();
        if (section == Section.OTHER && BtgTerms.fold(description).startsWith("pagamento em")) {
            return Optional.empty();
        }
        Installment installment = null;
        Matcher im = INSTALLMENT.matcher(description);
        if (im.find()) {
            installment = Installment.of(Integer.parseInt(im.group(1)), Integer.parseInt(im.group(2))).orElse(null);
            if (installment != null) {
                description = description.substring(0, im.start()).strip();
            }
        }
        Optional<LocalDate> date = BtgCardStatementParser.purchaseDate(Integer.parseInt(m.group(1)), month(m.group(2)), billing, null);
        double charge = BtgTerms.money(m.group(4).replace('−', '-')).orElse(0.0);
        if (date.isEmpty() || charge == 0) {
            return Optional.empty();
        }
        PaymentMethod method = section == Section.OTHER ? PaymentMethod.CREDIT_PIX : PaymentMethod.CREDIT_CARD;
        return Optional.of(new StatementEntry(date.get(), null, description, -charge, method, null, installment, false));
    }

    private static int month(String name) {
        return BtgTerms.MONTHS.get(BtgTerms.fold(name));
    }
}
