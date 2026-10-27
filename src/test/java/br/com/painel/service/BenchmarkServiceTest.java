package br.com.painel.service;

import br.com.painel.dto.Point;
import br.com.painel.dto.RatePoint;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BenchmarkServiceTest {

    @Test
    void cdiAcumulaComposto() {
        List<Point> idx = BenchmarkService.indiceAcumulado(List.of(
                new RatePoint("2026-10-26", 0.05), new RatePoint("2026-10-27", 0.05)));
        assertEquals(1.0005, idx.get(0).v(), 1e-12);
        assertEquals(1.0005 * 1.0005, idx.get(1).v(), 1e-12);
    }

    @Test
    void criptoUsaODolarDoMesmoDiaOuDoAnterior() {
        List<Point> usd = List.of(new Point(100, 5.0), new Point(300, 6.0));
        List<Point> btc = List.of(new Point(50, 1), new Point(100, 10), new Point(200, 10), new Point(300, 10));
        // em t=50 ainda não há cotação do dólar: o ponto é descartado
        assertEquals(List.of(new Point(100, 50), new Point(200, 50), new Point(300, 60)), BenchmarkService.emReais(btc, usd));
    }
}
