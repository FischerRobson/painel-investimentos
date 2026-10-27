package br.com.painel.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class NumbersTest {

    @Test
    void parseiaFormatoBrasileiro() {
        assertEquals(1234.56, Numbers.parseBr("1.234,56"));
        assertEquals(0.0958, Numbers.parseBr("9,58%"), 1e-12);
        assertEquals(-0.12, Numbers.parseBr(" -12,00% "), 1e-12);
        assertEquals(84753.0, Numbers.parseBr(" 84.753,00"));
    }

    @Test
    void textoQueNaoEhNumeroViraNull() {
        assertNull(Numbers.parseBr("-"));
        assertNull(Numbers.parseBr(""));
        assertNull(Numbers.parseBr(null));
        assertNull(Numbers.parseBr("Shoppings"));
    }

    @Test
    void orSegueTruthyDoJs() {
        assertEquals(2.0, Numbers.or(0.0, 2.0));
        assertEquals(2.0, Numbers.or(null, 2.0));
        assertEquals(1.0, Numbers.or(1.0, 2.0));
    }
}
