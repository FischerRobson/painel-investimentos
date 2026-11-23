package br.com.painel.util;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class B3CalendarTest {

    @Test
    void easter() {
        assertEquals(LocalDate.of(2024, 3, 31), B3Calendar.easter(2024));
        assertEquals(LocalDate.of(2025, 4, 20), B3Calendar.easter(2025));
        assertEquals(LocalDate.of(2026, 4, 5), B3Calendar.easter(2026));
        assertEquals(LocalDate.of(2027, 3, 28), B3Calendar.easter(2027));
    }

    @Test
    void holidaysOf2026() {
        for (String d : new String[]{"2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01",
                "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-20", "2026-12-24", "2026-12-25", "2026-12-31"}) {
            assertFalse(B3Calendar.isTradingDay(LocalDate.parse(d)), d);
        }
        // Quarta-feira de Cinzas tem pregão (começa às 13h)
        assertTrue(B3Calendar.isTradingDay(LocalDate.parse("2026-02-18")));
        assertTrue(B3Calendar.isTradingDay(LocalDate.parse("2026-11-23")));
    }

    @Test
    void weekendsAndBlackConsciousnessBefore2024() {
        assertFalse(B3Calendar.isTradingDay(LocalDate.parse("2026-11-21"))); // sábado
        assertFalse(B3Calendar.isTradingDay(LocalDate.parse("2026-11-22"))); // domingo
        assertTrue(B3Calendar.isTradingDay(LocalDate.parse("2023-11-20")));  // ainda não era feriado nacional
    }

    @Test
    void previousTradingDaySkipsWeekendsAndHolidays() {
        assertEquals(LocalDate.parse("2026-11-19"), B3Calendar.previousTradingDay(LocalDate.parse("2026-11-23"))); // pula 20 (feriado), 21, 22
        assertEquals(LocalDate.parse("2026-02-13"), B3Calendar.previousTradingDay(LocalDate.parse("2026-02-18"))); // pula o Carnaval
    }
}
