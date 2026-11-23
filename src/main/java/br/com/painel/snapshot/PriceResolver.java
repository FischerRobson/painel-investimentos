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

    // Unit price used for a holding: fresh, the last known one (staleSince = its date) or none (missing, unit = 0)
    record Priced(double unit, String staleSince, boolean missing) {
    }

    double value(String key, String label, double quantity, DoubleSupplier freshPrice) {
        return value(key, label, quantity, freshPrice, null);
    }

    double value(String key, String label, double quantity, DoubleSupplier freshPrice, KnownPrice lastResort) {
        return quantity * price(key, label, freshPrice, lastResort).unit();
    }

    Priced price(String key, String label, DoubleSupplier freshPrice) {
        return price(key, label, freshPrice, null);
    }

    Priced price(String key, String label, DoubleSupplier freshPrice, KnownPrice lastResort) {
        try {
            double unit = freshPrice.getAsDouble();
            if (Double.isFinite(unit) && unit >= 0) {
                fresh.put(key, new KnownPrice(unit, today));
                return new Priced(unit, null, false);
            }
        } catch (RuntimeException ignored) {
        }
        KnownPrice previous = known.getOrDefault(key, lastResort);
        if (previous != null) {
            stale.add(new StaleQuote(label, previous.date()));
            return new Priced(previous.value(), previous.date() == null ? "" : previous.date(), false);
        }
        missing.add(label);
        return new Priced(0, null, true);
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
