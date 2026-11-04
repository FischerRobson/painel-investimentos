package br.com.painel.snapshot;

import br.com.painel.dto.RatePoint;
import br.com.painel.dto.RatesResponse;
import br.com.painel.model.FixedIncome;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FixedIncomeCalculatorTest {

    private static final RatesResponse RATES = new RatesResponse(
            List.of(new RatePoint("2026-01-02", 0.05), new RatePoint("2026-01-05", 0.05), new RatePoint("2026-01-06", 0.05)),
            List.of(new RatePoint("2026-01-01", 0.5), new RatePoint("2026-02-01", 0.4)),
            null);

    private static FixedIncome title(String index, double rate, boolean exempt, String maturity) {
        return new FixedIncome("x", "CDB", "CDB", index, rate, 1000.0, "2026-01-02", maturity, exempt);
    }

    @Test
    void cdiCompoundsBusinessDaysAndTaxesIncome() {
        double gross = 1000 * Math.pow(1 + 0.0005, 3);
        double net = gross - (gross - 1000) * 0.225;
        assertEquals(net, FixedIncomeCalculator.netValue(title("cdi", 100, false, null), RATES, LocalDate.parse("2026-01-07")), 1e-9);
    }

    @Test
    void exemptTitlesPayNoTax() {
        double gross = 1000 * Math.pow(1 + 0.0005 * 0.9, 3);
        assertEquals(gross, FixedIncomeCalculator.netValue(title("cdi", 90, true, null), RATES, LocalDate.parse("2026-01-07")), 1e-9);
    }

    @Test
    void stopsAtMaturity() {
        double gross = 1000 * Math.pow(1 + 0.0005, 2);
        assertEquals(gross, FixedIncomeCalculator.netValue(title("cdi", 100, true, "2026-01-06"), RATES, LocalDate.parse("2026-03-01")), 1e-9);
    }

    @Test
    void ipcaUsesFullMonthsAfterStart() {
        double gross = 1000 * 1.004 * Math.pow(1.06, 3 / 252.0);
        assertEquals(gross, FixedIncomeCalculator.netValue(title("ipca", 6, true, null), RATES, LocalDate.parse("2026-03-10")), 1e-9);
    }
}
