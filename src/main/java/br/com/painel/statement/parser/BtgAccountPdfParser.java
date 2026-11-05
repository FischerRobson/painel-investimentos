package br.com.painel.statement.parser;

import br.com.painel.service.InvalidDataException;
import br.com.painel.statement.ParsedStatement;
import br.com.painel.statement.ParsedStatement.StatementKind;
import br.com.painel.statement.StatementEntry;
import br.com.painel.statement.document.PdfLine;
import br.com.painel.statement.document.PdfWord;
import br.com.painel.statement.document.StatementFile;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@ApplicationScoped
public class BtgAccountPdfParser implements StatementParser {

    private static final Pattern DATE = Pattern.compile("\\d{2}/\\d{2}/\\d{4}");
    private static final Pattern TIME = Pattern.compile("\\d{2}h\\d{2}");
    private static final Pattern HOLDER = Pattern.compile("^Cliente: (.+)$");
    private static final String HEADER = "Data e hora";
    private static final String FOOTER = "Ouvidoria:";
    private static final double CELL_GAP = 6;
    private static final double SAME_ROW = 13;
    private static final double COLUMN_SLACK = 4;
    private static final int TEXT_COLUMNS = 4;
    private static final int CATEGORY = 1, TRANSACTION = 2, DESCRIPTION = 3;

    @Override
    public String name() {
        return "btg-account-pdf";
    }

    @Override
    public boolean supports(StatementFile file) {
        return file.isPdf() && file.pdf().contains(BtgTerms.ACCOUNT_TITLE) && file.pdf().contains(HEADER);
    }

    @Override
    public ParsedStatement parse(StatementFile file) {
        List<PdfLine> lines = file.pdf().lines();
        String holder = lines.stream().map(l -> HOLDER.matcher(l.text())).filter(m -> m.matches())
                .map(m -> m.group(1)).findFirst().orElse(null);
        List<Row> rows = rows(tableLines(lines));
        double[] starts = columnStarts(rows);
        List<StatementEntry> entries = new ArrayList<>();
        for (Row row : rows) {
            toEntry(row, starts).ifPresent(entries::add);
        }
        BtgTerms.required(holder, "o nome do cliente");
        return new ParsedStatement("Extrato BTG Pactual (PDF)", StatementKind.CHECKING_ACCOUNT, holder, null, entries);
    }

    private static List<PdfLine> tableLines(List<PdfLine> lines) {
        List<PdfLine> table = new ArrayList<>();
        boolean inside = false;
        for (PdfLine l : lines) {
            String text = l.text();
            if (text.startsWith(HEADER)) {
                inside = true;
            } else if (text.startsWith(FOOTER)) {
                inside = false;
            } else if (inside) {
                table.add(l);
            }
        }
        return table;
    }

    private static List<Row> rows(List<PdfLine> lines) {
        List<Row> rows = new ArrayList<>();
        for (PdfLine l : lines) {
            if (isAnchor(l)) {
                rows.add(new Row(l));
            }
        }
        for (PdfLine l : lines) {
            if (isAnchor(l)) {
                continue;
            }
            rows.stream().filter(r -> r.anchor.page() == l.page() && Math.abs(r.anchor.y() - l.y()) <= SAME_ROW)
                    .min(Comparator.comparingDouble(r -> Math.abs(r.anchor.y() - l.y())))
                    .ifPresent(r -> r.extra.add(l));
        }
        return rows;
    }

    private static boolean isAnchor(PdfLine l) {
        return l.words().size() >= 2 && DATE.matcher(l.words().get(0).text()).matches()
                && TIME.matcher(l.words().get(1).text()).matches();
    }

    private static double[] columnStarts(List<Row> rows) {
        List<double[]> complete = rows.stream().map(r -> cells(r.anchor)).map(BtgAccountPdfParser::withoutAmount)
                .filter(c -> c.size() == TEXT_COLUMNS).map(c -> c.stream().mapToDouble(Cell::x).toArray()).toList();
        if (complete.isEmpty()) {
            throw new InvalidDataException("não reconheci as colunas do extrato em PDF");
        }
        double[] starts = new double[TEXT_COLUMNS];
        for (int i = 0; i < TEXT_COLUMNS; i++) {
            int col = i;
            double[] xs = complete.stream().mapToDouble(c -> c[col]).sorted().toArray();
            starts[i] = xs[xs.length / 2];
        }
        return starts;
    }

    private static Optional<StatementEntry> toEntry(Row row, double[] starts) {
        List<Cell> anchorCells = cells(row.anchor);
        if (anchorCells.isEmpty() || !BtgTerms.MONEY.matcher(anchorCells.getLast().text()).matches()) {
            return Optional.empty();
        }
        double amount = BtgTerms.money(anchorCells.getLast().text()).orElse(0.0);
        List<Line> parts = new ArrayList<>();
        parts.add(new Line(row.anchor.y(), withoutAmount(anchorCells)));
        row.extra.forEach(l -> parts.add(new Line(l.y(), cells(l))));
        parts.sort(Comparator.comparingDouble(Line::y));
        String[] columns = new String[TEXT_COLUMNS];
        Arrays.fill(columns, "");
        for (Line part : parts) {
            for (Cell c : part.cells) {
                int col = column(c.x(), starts);
                columns[col] = (columns[col] + " " + c.text()).strip();
            }
        }
        Optional<LocalDateTime> when = BtgTerms.dateTime(columns[0]);
        String description = columns[DESCRIPTION];
        if (when.isEmpty() || amount == 0 || description.isBlank() || description.equalsIgnoreCase(BtgTerms.DAILY_BALANCE)) {
            return Optional.empty();
        }
        String tx = columns[TRANSACTION];
        return Optional.of(new StatementEntry(when.get().toLocalDate(), when.get().toLocalTime(), description, amount,
                BtgTerms.method(tx), columns[CATEGORY].isBlank() ? null : columns[CATEGORY], null,
                BtgTerms.isCardBillPayment(tx)));
    }

    private static int column(double x, double[] starts) {
        int col = 0;
        for (int i = 0; i < starts.length; i++) {
            if (x + COLUMN_SLACK >= starts[i]) {
                col = i;
            }
        }
        return col;
    }

    private static List<Cell> cells(PdfLine line) {
        List<Cell> cells = new ArrayList<>();
        List<PdfWord> current = new ArrayList<>();
        for (PdfWord w : line.words()) {
            if (!current.isEmpty() && w.x() - current.getLast().endX() > CELL_GAP) {
                cells.add(Cell.of(current));
                current = new ArrayList<>();
            }
            current.add(w);
        }
        if (!current.isEmpty()) {
            cells.add(Cell.of(current));
        }
        return cells;
    }

    private static List<Cell> withoutAmount(List<Cell> cells) {
        return !cells.isEmpty() && BtgTerms.MONEY.matcher(cells.getLast().text()).matches()
                ? cells.subList(0, cells.size() - 1) : cells;
    }

    private record Cell(double x, String text) {
        static Cell of(List<PdfWord> words) {
            return new Cell(words.getFirst().x(), words.stream().map(PdfWord::text).collect(Collectors.joining(" ")));
        }
    }

    private record Line(double y, List<Cell> cells) {
    }

    private static final class Row {
        final PdfLine anchor;
        final List<PdfLine> extra = new ArrayList<>();

        Row(PdfLine anchor) {
            this.anchor = anchor;
        }
    }
}
