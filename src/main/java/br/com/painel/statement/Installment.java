package br.com.painel.statement;

import java.util.Optional;
import java.util.regex.Pattern;

public record Installment(int number, int total) {

    private static final Pattern TEXT = Pattern.compile("(\\d{1,3})/(\\d{1,3})");

    public static Optional<Installment> parse(String text) {
        if (text == null) {
            return Optional.empty();
        }
        var m = TEXT.matcher(text.strip());
        if (!m.matches()) {
            return Optional.empty();
        }
        return of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)));
    }

    public static Optional<Installment> of(int number, int total) {
        return number >= 1 && total >= 2 && number <= total ? Optional.of(new Installment(number, total)) : Optional.empty();
    }

    public boolean hasNext() {
        return number < total;
    }

    @Override
    public String toString() {
        return number + "/" + total;
    }
}
