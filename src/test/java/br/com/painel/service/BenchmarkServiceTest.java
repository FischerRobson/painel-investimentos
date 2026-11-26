package br.com.painel.service;

import java.time.ZoneOffset;
import java.time.LocalDate;
import br.com.painel.dto.Point;
import br.com.painel.dto.RatePoint;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BenchmarkServiceTest {

    @Test
    void cdiCompounds() {
        List<Point> idx = BenchmarkService.cumulativeIndex(List.of(
                new RatePoint("2026-10-26", 0.05), new RatePoint("2026-10-27", 0.05)));
        assertEquals(1.0005, idx.get(0).v(), 1e-12);
        assertEquals(1.0005 * 1.0005, idx.get(1).v(), 1e-12);
    }

    @Test
    void cryptoUsesSameOrPreviousDayDollar() {
        List<Point> usd = List.of(new Point(100, 5.0), new Point(300, 6.0));
        List<Point> btc = List.of(new Point(50, 1), new Point(100, 10), new Point(200, 10), new Point(300, 10));
        // at t=50 there is no dollar quote yet: the point is dropped
        assertEquals(List.of(new Point(100, 50), new Point(200, 50), new Point(300, 60)), BenchmarkService.toBrl(btc, usd));
    }

    @Test
    void shortRangesAreCutAtTheStartDate() {
        LocalDate start = LocalDate.parse("2026-10-26");
        List<Point> points = List.of(new Point(at("2026-10-23"), 1), new Point(at("2026-10-26"), 2), new Point(at("2026-11-02"), 3));
        assertEquals(List.of(points.get(1), points.get(2)), BenchmarkService.since(points, start));
    }

    private static long at(String day) {
        return LocalDate.parse(day).atTime(13, 0).toInstant(ZoneOffset.UTC).toEpochMilli();
    }
}
