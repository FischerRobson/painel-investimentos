package br.com.painel.statement.parser;

import br.com.painel.model.PaymentMethod;
import br.com.painel.service.InvalidDataException;

import java.text.Normalizer;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

final class BtgTerms {

    static final String ACCOUNT_TITLE = "Extrato de conta corrente";
    static final String DAILY_BALANCE = "Saldo Diário";
    static final Pattern MONEY = Pattern.compile("(-)?\\s?R\\$\\s?(\\d{1,3}(?:\\.\\d{3})*,\\d{2})");
    static final Map<String, Integer> MONTHS = Map.ofEntries(
            Map.entry("jan", 1), Map.entry("fev", 2), Map.entry("mar", 3), Map.entry("abr", 4),
            Map.entry("mai", 5), Map.entry("jun", 6), Map.entry("jul", 7), Map.entry("ago", 8),
            Map.entry("set", 9), Map.entry("out", 10), Map.entry("nov", 11), Map.entry("dez", 12));

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd/MM/uuuu HH:mm");
    private static final String CARD_BILL = "pagamento de fatura";

    private BtgTerms() {
    }

    static PaymentMethod method(String transaction) {
        String t = fold(transaction);
        if (t.startsWith("pix")) {
            return PaymentMethod.PIX;
        }
        if (t.contains("debito")) {
            return PaymentMethod.DEBIT_CARD;
        }
        if (t.contains("boleto") || t.contains("convenio") || t.startsWith("pagamento de conta") || t.startsWith(CARD_BILL)) {
            return PaymentMethod.BILL;
        }
        if (t.contains("transferencia") || t.startsWith("ted") || t.contains("salario")) {
            return PaymentMethod.TRANSFER;
        }
        return PaymentMethod.OTHER;
    }

    static boolean isCardBillPayment(String transaction) {
        return fold(transaction).startsWith(CARD_BILL);
    }

    static Optional<Double> money(String text) {
        var m = MONEY.matcher(text == null ? "" : text);
        if (!m.find()) {
            return Optional.empty();
        }
        double v = Double.parseDouble(m.group(2).replace(".", "").replace(',', '.'));
        return Optional.of(m.group(1) != null ? -v : v);
    }

    static Optional<LocalDateTime> dateTime(String text) {
        if (text == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(LocalDateTime.parse(text.strip().replace('h', ':'), DATE_TIME));
        } catch (DateTimeParseException e) {
            return Optional.empty();
        }
    }

    static String required(String value, String what) {
        if (value == null || value.isBlank()) {
            throw new InvalidDataException("não encontrei " + what + " no arquivo");
        }
        return value.strip();
    }

    static String fold(String text) {
        if (text == null) {
            return "";
        }
        return Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).strip();
    }
}
