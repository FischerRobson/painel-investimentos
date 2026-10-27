package br.com.painel.util;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

public final class Tickers {

    private static final Pattern VALID = Pattern.compile("[A-Z0-9^=\\-.]{1,15}");
    private static final Pattern B3 = Pattern.compile("[A-Z]{4}\\d{1,2}[A-Z]?");
    private static final Pattern SEPARATORS = Pattern.compile("[,\\s;]+");
    private static final int MAX = 30;

    private Tickers() {
    }

    public static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.strip().toUpperCase(Locale.ROOT);
        if (s.endsWith(".SA")) {
            s = s.substring(0, s.length() - 3);
        }
        return VALID.matcher(s).matches() ? s : null;
    }

    public static List<String> parse(String raw) {
        Set<String> out = new LinkedHashSet<>();
        for (String part : SEPARATORS.split(raw == null ? "" : raw)) {
            String t = normalize(part);
            if (t != null) {
                out.add(t);
            }
        }
        return out.stream().limit(MAX).toList();
    }

    // BBDC4, KNRI11, SANB3F…; o resto é tratado como exterior (AAPL, MSFT)
    public static boolean isB3(String ticker) {
        return B3.matcher(ticker).matches();
    }
}
