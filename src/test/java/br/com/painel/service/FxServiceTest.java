package br.com.painel.service;

import br.com.painel.dto.FxQuote;
import br.com.painel.dto.Point;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class FxServiceTest {

    @Test
    void converteASerieDoBceParaReaisPorMoeda() throws Exception {
        LocalDate hoje = LocalDate.now(ZoneId.of("Europe/Berlin"));
        String json = """
            {"base":"BRL","rates":{
              "%s":{"USD":0.2,"JPY":25.0},
              "%s":{"USD":0.25,"JPY":20.0},
              "%s":{"USD":0.16,"JPY":27.0}
            }}""".formatted(hoje.minusDays(40), hoje.minusDays(2), hoje.minusDays(1));
        Map<String, List<Point>> s = FxService.parseEcb(new ObjectMapper().readTree(json), 30);
        // o ponto de 40 dias atrás fica como início do período (o único antes dele)
        assertEquals(3, s.get("USD").size());
        assertEquals(5.0, s.get("USD").get(0).v(), 1e-9);
        assertEquals(6.25, s.get("USD").get(2).v(), 1e-9);
        assertEquals(1 / 27.0, s.get("JPY").get(2).v(), 1e-12);

        FxQuote q = FxService.quoteFromSeries("Dólar Americano", s.get("USD"));
        assertEquals(6.25, q.bid(), 1e-9);
        assertEquals((6.25 / 4.0 - 1) * 100, q.pct(), 1e-9);
        assertNull(FxService.quoteFromSeries("x", List.of()));
    }
}
