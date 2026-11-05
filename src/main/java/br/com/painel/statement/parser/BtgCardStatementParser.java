package br.com.painel.statement.parser;

import br.com.painel.model.PaymentMethod;
import br.com.painel.service.InvalidDataException;
import br.com.painel.statement.Installment;
import br.com.painel.statement.ParsedStatement;
import br.com.painel.statement.ParsedStatement.StatementKind;
import br.com.painel.statement.StatementEntry;
import br.com.painel.statement.document.PdfLine;
import br.com.painel.statement.document.StatementFile;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@ApplicationScoped
public class BtgCardStatementParser implements StatementParser {

    private static final String MONTH = "(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)";
    private static final String AMOUNT = "-?\\s?R\\$\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
    private static final Pattern ITEM = Pattern.compile(
            "\\G\\s*(\\d{2}) (" + MONTH + ") (.+?) (" + AMOUNT + ")(?=\\s+\\d{2} " + MONTH + " |\\s*$)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TITLE = Pattern.compile("^(.+?) \\| fatura de (\\p{L}+) de (\\d{4}) \\| cartão final \\d{4}");
    private static final Pattern INSTALLMENT = Pattern.compile("\\s*\\((\\d{1,3})/(\\d{1,3})\\)$");
    private static final List<String> SECTION_ENDS = List.of("Pagamentos feitos pelo cliente", "Taxas e encargos",
            "Operações de Créditos", "Resumo da Fatura", "Mensalidade Cashbacks");

    private enum Section { NONE, CARD, OTHER }

    @Override
    public String name() {
        return "btg-card-pdf";
    }

    @Override
    public boolean supports(StatementFile file) {
        return file.isPdf() && file.pdf().lines().stream().anyMatch(l -> TITLE.matcher(l.text()).find());
    }

    @Override
    public ParsedStatement parse(StatementFile file) {
        List<PdfLine> lines = file.pdf().lines();
        Matcher title = lines.stream().map(l -> TITLE.matcher(l.text())).filter(Matcher::find).findFirst().orElseThrow();
        String holder = title.group(1).strip();
        YearMonth billing = YearMonth.of(Integer.parseInt(title.group(3)), monthNumber(title.group(2)));
        List<StatementEntry> entries = new ArrayList<>();
        Section section = Section.NONE;
        for (PdfLine line : lines) {
            String text = line.text();
            if (text.startsWith("Lançamentos do cartão")) {
                section = Section.CARD;
            } else if (text.startsWith("Outros Lançamentos")) {
                section = Section.OTHER;
            } else if (SECTION_ENDS.stream().anyMatch(text::startsWith)) {
                section = Section.NONE;
            } else if (section != Section.NONE) {
                entries.addAll(items(text, section, billing));
            }
        }
        return new ParsedStatement("Fatura do cartão BTG Pactual", StatementKind.CREDIT_CARD, holder, billing, entries);
    }

    private static List<StatementEntry> items(String text, Section section, YearMonth billing) {
        List<StatementEntry> found = new ArrayList<>();
        Matcher m = ITEM.matcher(text);
        int end = 0;
        while (m.find()) {
            end = m.end();
            String description = m.group(3).strip();
            Installment installment = null;
            Matcher im = INSTALLMENT.matcher(description);
            if (im.find()) {
                installment = Installment.of(Integer.parseInt(im.group(1)), Integer.parseInt(im.group(2))).orElse(null);
                if (installment != null) {
                    description = description.substring(0, im.start()).strip();
                }
            }
            Optional<LocalDate> date = purchaseDate(Integer.parseInt(m.group(1)), monthNumber(m.group(2)), billing, installment);
            double charge = BtgTerms.money(m.group(4)).orElse(0.0);
            if (date.isEmpty() || charge == 0) {
                continue;
            }
            PaymentMethod method = section == Section.OTHER && BtgTerms.fold(description).contains("pix")
                    ? PaymentMethod.CREDIT_PIX : PaymentMethod.CREDIT_CARD;
            found.add(new StatementEntry(date.get(), null, description, -charge, method, null, installment, false));
        }
        return end == text.length() ? found : List.of();
    }

    static Optional<LocalDate> purchaseDate(int day, int month, YearMonth billing, Installment installment) {
        int minMonthsBack = installment == null ? 0 : installment.number() - 1;
        for (int year = billing.getYear(); year >= billing.getYear() - 3; year--) {
            YearMonth candidate = YearMonth.of(year, month);
            if (!candidate.isAfter(billing) && candidate.until(billing, ChronoUnit.MONTHS) >= minMonthsBack) {
                try {
                    return Optional.of(candidate.atDay(day));
                } catch (DateTimeException e) {
                    return Optional.empty();
                }
            }
        }
        return Optional.empty();
    }

    private static int monthNumber(String name) {
        String key = BtgTerms.fold(name);
        Integer month = BtgTerms.MONTHS.get(key.substring(0, Math.min(3, key.length())));
        if (month == null) {
            throw new InvalidDataException("mês desconhecido na fatura: " + name);
        }
        return month;
    }
}
