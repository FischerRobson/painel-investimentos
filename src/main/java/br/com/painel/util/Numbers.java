package br.com.painel.util;

public final class Numbers {

    private Numbers() {
    }

    // Formato brasileiro: "1.234,56" → 1234.56 e "9,58%" → 0.0958; null se não for número
    public static Double parseBr(String s) {
        if (s == null) {
            return null;
        }
        String v = s.strip().replace(".", "").replace(",", ".");
        boolean pct = v.endsWith("%");
        if (pct) {
            v = v.substring(0, v.length() - 1);
        }
        if (v.isEmpty() || !v.matches("[-+]?\\d*\\.?\\d+([eE][-+]?\\d+)?")) {
            return null;
        }
        double d = Double.parseDouble(v);
        return pct ? d / 100 : d;
    }

    // Como no JS: nulo ou zero contam como "sem valor"
    public static boolean truthy(Double d) {
        return d != null && d != 0;
    }

    public static Double or(Double a, Double b) {
        return truthy(a) ? a : b;
    }

    public static double round(double v, int decimals) {
        double f = Math.pow(10, decimals);
        return Math.round(v * f) / f;
    }
}
