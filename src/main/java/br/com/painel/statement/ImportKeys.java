package br.com.painel.statement;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;

public final class ImportKeys {

    private static final int LENGTH = 24;

    private final String scope;
    private final Map<String, Integer> seen = new HashMap<>();

    public ImportKeys(ParsedStatement.StatementKind kind) {
        this.scope = kind.name();
    }

    public Key next(StatementEntry e) {
        String base = String.join("|", scope, e.date().toString(), e.time() == null ? "" : e.time().toString(),
                normalize(e.description()), Long.toString(Math.round(e.amount() * 100)));
        int occurrence = seen.merge(base + "|" + e.installment(), 1, Integer::sum) - 1;
        return new Key(base, occurrence);
    }

    public static String normalize(String text) {
        return Normalizer.normalize(text == null ? "" : text, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").strip();
    }

    public record Key(String base, int occurrence) {

        public String forInstallment(Installment installment) {
            String raw = base + "|" + (installment == null ? "" : installment.toString()) + "|" + occurrence;
            try {
                byte[] hash = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
                return HexFormat.of().formatHex(hash).substring(0, LENGTH);
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException(e);
            }
        }
    }
}
