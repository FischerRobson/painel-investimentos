package br.com.painel.util;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.MonthDay;
import java.util.Set;

// B3 trading days: weekdays that are not a B3 holiday. Holidays are computed (no external source): the fixed national
// holidays, the days the exchange has no session (Dec 24 and Dec 31) and the Easter-based ones (Carnival Monday and
// Tuesday, Good Friday, Corpus Christi). Black Consciousness Day (Nov 20) is a national holiday since 2024 (Lei 14.759/2023).
public final class B3Calendar {

    private static final Set<MonthDay> FIXED = Set.of(
            MonthDay.of(1, 1),    // Confraternização Universal
            MonthDay.of(4, 21),   // Tiradentes
            MonthDay.of(5, 1),    // Dia do Trabalho
            MonthDay.of(9, 7),    // Independência
            MonthDay.of(10, 12),  // Nossa Senhora Aparecida
            MonthDay.of(11, 2),   // Finados
            MonthDay.of(11, 15),  // Proclamação da República
            MonthDay.of(12, 24),  // véspera de Natal (sem pregão)
            MonthDay.of(12, 25),  // Natal
            MonthDay.of(12, 31)); // último dia do ano (sem pregão)

    private B3Calendar() {
    }

    public static boolean isTradingDay(LocalDate day) {
        DayOfWeek dow = day.getDayOfWeek();
        return dow != DayOfWeek.SATURDAY && dow != DayOfWeek.SUNDAY && !isHoliday(day);
    }

    public static boolean isHoliday(LocalDate day) {
        if (FIXED.contains(MonthDay.from(day))) {
            return true;
        }
        if (day.getYear() >= 2024 && MonthDay.from(day).equals(MonthDay.of(11, 20))) {
            return true; // Consciência Negra
        }
        LocalDate easter = easter(day.getYear());
        return day.equals(easter.minusDays(48))  // Carnaval (segunda)
                || day.equals(easter.minusDays(47))  // Carnaval (terça)
                || day.equals(easter.minusDays(2))   // Sexta-feira Santa
                || day.equals(easter.plusDays(60));  // Corpus Christi
    }

    // Last trading day before the given day
    public static LocalDate previousTradingDay(LocalDate day) {
        LocalDate d = day.minusDays(1);
        while (!isTradingDay(d)) {
            d = d.minusDays(1);
        }
        return d;
    }

    // Easter Sunday (Gregorian calendar, anonymous algorithm by Meeus/Jones/Butcher)
    static LocalDate easter(int year) {
        int a = year % 19, b = year / 100, c = year % 100, d = b / 4, e = b % 4;
        int f = (b + 8) / 25, g = (b - f + 1) / 3, h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4, k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
        int m = (a + 11 * h + 22 * l) / 451;
        int month = (h + l - 7 * m + 114) / 31, dayOfMonth = (h + l - 7 * m + 114) % 31 + 1;
        return LocalDate.of(year, month, dayOfMonth);
    }
}
