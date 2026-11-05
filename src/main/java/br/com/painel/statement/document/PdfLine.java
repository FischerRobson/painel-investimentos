package br.com.painel.statement.document;

import java.util.List;
import java.util.stream.Collectors;

public record PdfLine(int page, double y, List<PdfWord> words) {

    public PdfLine {
        words = List.copyOf(words);
    }

    public static PdfLine of(int page, double y, List<PdfWord> words) {
        return new PdfLine(page, y, words.stream().sorted((a, b) -> Double.compare(a.x(), b.x())).toList());
    }

    public String text() {
        return words.stream().map(PdfWord::text).collect(Collectors.joining(" "));
    }
}
