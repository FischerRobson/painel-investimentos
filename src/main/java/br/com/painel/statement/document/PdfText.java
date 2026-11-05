package br.com.painel.statement.document;

import br.com.painel.service.InvalidDataException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

import java.io.IOException;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public record PdfText(List<PdfLine> lines) {

    private static final double SAME_LINE = 2.5;

    public PdfText {
        lines = List.copyOf(lines);
    }

    public static PdfText read(byte[] content) {
        try (PDDocument doc = Loader.loadPDF(content)) {
            if (doc.isEncrypted()) {
                throw new InvalidDataException("o PDF está protegido por senha");
            }
            WordCollector collector = new WordCollector();
            collector.setSortByPosition(true);
            collector.writeText(doc, new StringWriter());
            return new PdfText(collector.lines());
        } catch (IOException e) {
            throw new InvalidDataException("não foi possível ler o PDF");
        }
    }

    public boolean contains(String text) {
        return lines.stream().anyMatch(l -> l.text().contains(text));
    }

    private static final class WordCollector extends PDFTextStripper {

        private final List<PdfWord> words = new ArrayList<>();
        private final List<PdfLine> lines = new ArrayList<>();

        WordCollector() throws IOException {
        }

        @Override
        protected void writeString(String text, List<TextPosition> positions) {
            StringBuilder current = new StringBuilder();
            double start = 0, end = 0, y = 0;
            for (TextPosition p : positions) {
                String ch = p.getUnicode();
                if (ch == null || ch.isBlank()) {
                    flush(current, start, end, y);
                    current.setLength(0);
                    continue;
                }
                if (current.isEmpty()) {
                    start = p.getXDirAdj();
                    y = p.getYDirAdj();
                } else if (p.getXDirAdj() - end > p.getWidthOfSpace() * 0.8) {
                    flush(current, start, end, y);
                    current.setLength(0);
                    start = p.getXDirAdj();
                    y = p.getYDirAdj();
                }
                current.append(ch);
                end = p.getXDirAdj() + p.getWidthDirAdj();
            }
            flush(current, start, end, y);
        }

        private void flush(StringBuilder current, double start, double end, double y) {
            if (!current.isEmpty()) {
                words.add(new PdfWord(current.toString(), start, end, y));
            }
        }

        @Override
        protected void endPage(PDPage page) throws IOException {
            super.endPage(page);
            int pageNo = getCurrentPageNo();
            List<PdfWord> pageWords = new ArrayList<>(words);
            words.clear();
            pageWords.sort(Comparator.comparingDouble(PdfWord::y).thenComparingDouble(PdfWord::x));
            List<PdfWord> line = new ArrayList<>();
            double lineY = Double.NaN;
            for (PdfWord w : pageWords) {
                if (!line.isEmpty() && Math.abs(w.y() - lineY) > SAME_LINE) {
                    lines.add(PdfLine.of(pageNo, lineY, line));
                    line = new ArrayList<>();
                }
                if (line.isEmpty()) {
                    lineY = w.y();
                }
                line.add(w);
            }
            if (!line.isEmpty()) {
                lines.add(PdfLine.of(pageNo, lineY, line));
            }
        }

        List<PdfLine> lines() {
            return lines;
        }
    }
}
