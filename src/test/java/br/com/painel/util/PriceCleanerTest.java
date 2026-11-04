package br.com.painel.util;

import br.com.painel.dto.Point;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PriceCleanerTest {

    @Test
    void dropsAbsurdQuote() {
        // Real XPML11 case: one day at R$ 1.06 among quotes near R$ 100
        List<Point> pts = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            pts.add(new Point(i, i == 10 ? 1.06 : 100 + i % 3));
        }
        List<Point> clean = PriceCleaner.clean(pts);
        assertEquals(19, clean.size());
        assertTrue(clean.stream().noneMatch(p -> p.v() < 50));
    }

    @Test
    void keepsNormalMoves() {
        List<Point> pts = List.of(new Point(1, 10), new Point(2, 11), new Point(3, 9.5), new Point(4, 12), new Point(5, 10.2));
        assertEquals(pts, PriceCleaner.clean(pts));
    }
}
