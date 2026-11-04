package br.com.painel.snapshot;

import br.com.painel.model.KnownPrice;
import br.com.painel.model.Snapshot.StaleQuote;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleSupplier;

// Values each holding with a fresh price when possible; otherwise falls back to the last known price and records it as stale.
final class PriceResolver {

    private final Map<String, KnownPrice> known;
    private final String today;
    private final Map<String, KnownPrice> fresh = new LinkedHashMap<>();
    private final List<StaleQuote> stale = new ArrayList<>();
    private final List<String> missing = new ArrayList<>();

    PriceResolver(Map<String, KnownPrice> known, String today) {
        this.known = known;
        this.today = today;
    }

    double value(String key, String label, double quantity, DoubleSupplier freshPrice) {
        return value(key, label, quantity, freshPrice, null);
    }

    double value(String key, String label, double quantity, DoubleSupplier freshPrice, KnownPrice lastResort) {
        try {
            double unit = freshPrice.getAsDouble();
            if (Double.isFinite(unit) && unit >= 0) {
                fresh.put(key, new KnownPrice(unit, today));
                return quantity * unit;
            }
        } catch (RuntimeException ignored) {
        }
        KnownPrice previous = known.getOrDefault(key, lastResort);
        if (previous != null) {
            stale.add(new StaleQuote(label, previous.date()));
            return quantity * previous.value();
        }
        missing.add(label);
        return 0;
    }

    Map<String, KnownPrice> fresh() {
        return fresh;
    }

    List<StaleQuote> stale() {
        return stale;
    }

    List<String> missing() {
        return missing;
    }
}
