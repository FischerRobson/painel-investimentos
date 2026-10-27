package br.com.painel.util;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TickersTest {

    @Test
    void parseNormalizaRemoveRepetidosEMantemOrdem() {
        assertEquals(List.of("BBDC4", "KNRI11", "AAPL"), Tickers.parse(" bbdc4.sa, KNRI11;aapl  BBDC4 "));
    }

    @Test
    void rejeitaLixo() {
        assertNull(Tickers.normalize("../etc"));
        assertNull(Tickers.normalize("<script>"));
        assertEquals(List.of(), Tickers.parse(""));
    }

    @Test
    void limitaEm30() {
        String many = String.join(",", java.util.stream.IntStream.range(0, 40).mapToObj(i -> "ABCD" + (i % 99 + 1)).toList());
        assertEquals(30, Tickers.parse(many).size());
    }

    @Test
    void identificaB3() {
        assertTrue(Tickers.isB3("BBDC4"));
        assertTrue(Tickers.isB3("KNRI11"));
        assertTrue(Tickers.isB3("AAPL34"));
        assertFalse(Tickers.isB3("AAPL"));
        assertFalse(Tickers.isB3("^BVSP"));
    }
}
