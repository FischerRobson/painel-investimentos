package br.com.painel.snapshot;

import br.com.painel.dto.RatePoint;
import br.com.painel.dto.RatesResponse;
import br.com.painel.model.FixedIncome;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

// Mark-to-curve value of a fixed income title, net of income tax, using the real CDI and IPCA from the Central Bank.
// Same rules as rfCalc in index.html.
public final class FixedIncomeCalculator {

    private FixedIncomeCalculator() {
    }

    public static double netValue(FixedIncome title, RatesResponse rates, LocalDate today) {
        String todayIso = today.toString();
        String end = title.maturity() != null && title.maturity().compareTo(todayIso) < 0 ? title.maturity() : todayIso;
        List<RatePoint> businessDays = rates.cdi().stream()
                .filter(p -> p.date().compareTo(title.start()) >= 0 && p.date().compareTo(end) < 0)
                .toList();
        int count = businessDays.size();
        double factor = switch (title.index()) {
            case "cdi" -> businessDays.stream().mapToDouble(p -> 1 + (p.value() / 100) * (title.rate() / 100)).reduce(1, (a, b) -> a * b);
            case "pre" -> Math.pow(1 + title.rate() / 100, count / 252.0);
            default -> {
                String firstMonth = title.start().substring(0, 7), lastMonth = end.substring(0, 7);
                double ipca = rates.ipca().stream()
                        .filter(p -> p.date().substring(0, 7).compareTo(firstMonth) > 0 && p.date().substring(0, 7).compareTo(lastMonth) < 0)
                        .mapToDouble(p -> 1 + p.value() / 100).reduce(1, (a, b) -> a * b);
                yield ipca * Math.pow(1 + title.rate() / 100, count / 252.0);
            }
        };
        double gross = title.invested() * factor;
        double income = gross - title.invested();
        long calendarDays = ChronoUnit.DAYS.between(LocalDate.parse(title.start()), LocalDate.parse(end));
        double taxRate = calendarDays <= 180 ? 0.225 : calendarDays <= 360 ? 0.20 : calendarDays <= 720 ? 0.175 : 0.15;
        double tax = title.taxExempt() ? 0 : Math.max(0, income) * taxRate;
        return gross - tax;
    }
}
