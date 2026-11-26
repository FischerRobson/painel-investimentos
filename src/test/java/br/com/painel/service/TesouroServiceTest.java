package br.com.painel.service;

import br.com.painel.dto.TesouroResponse;
import br.com.painel.dto.TesouroTitulo;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.StringReader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TesouroServiceTest {

    private static final String HEADER = "Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha\n";

    private static TesouroResponse ler(String csv) throws Exception {
        return TesouroService.ler(new BufferedReader(new StringReader(csv)));
    }

    @Test
    void leSoOBlocoMaisRecenteEParaNaDataMaisAntiga() throws Exception {
        TesouroResponse r = ler(HEADER
                + "Tesouro Selic;01/03/2031;19/11/2026;0,11;0,12;20251,92;20232,91;20232,91\n"
                + "Tesouro IPCA+ com Juros Semestrais;15/05/2035;19/11/2026;7,81;7,93;4283,66;4248,81;4248,81\n"
                + "Tesouro Prefixado;01/01/2029;19/11/2026;15,04;15,16;746,01;743,97;743,97\n"
                + "Tesouro Selic;01/03/2031;18/11/2026;0,10;0,11;20240,00;20220,00;20220,00\n"
                + "linha quebrada que não deveria nem ser lida\n");
        assertEquals("2026-11-19", r.data());
        assertNull(r.stale());
        assertEquals(3, r.titulos().size());
        // ordenado por tipo e vencimento
        assertEquals(new TesouroTitulo("Tesouro IPCA+ com Juros Semestrais", "2035-05-15", "ipca", true,
                7.81, 7.93, 4283.66, 4248.81, 4248.81), r.titulos().get(0));
        TesouroTitulo pre = r.titulos().get(1);
        assertEquals("pre", pre.indexador());
        assertFalse(pre.jurosSemestrais());
        assertEquals(15.04, pre.taxaCompra());
        assertEquals("selic", r.titulos().get(2).indexador());
        assertEquals(0.11, r.titulos().get(2).taxaCompra());
    }

    @Test
    void emOrdemCrescenteFicaComAUltimaData() throws Exception {
        TesouroResponse r = ler(HEADER
                + "Tesouro Prefixado;01/01/2008;05/01/2004;15,50;15,60;700,00;699,00;699,00\n"
                + "Tesouro Prefixado;01/01/2029;18/11/2026;15,00;15,12;745,00;742,00;742,00\n"
                + "Tesouro Prefixado;01/01/2029;19/11/2026;15,04;15,16;746,01;743,97;743,97\n"
                + "Tesouro Renda+ Aposentadoria Extra;15/12/2049;19/11/2026;7,64;7,76;1999,29;1974,09;1974,09\n");
        assertEquals("2026-11-19", r.data());
        assertEquals(2, r.titulos().size());
        assertEquals("ipca", r.titulos().get(1).indexador());
    }

    @Test
    void camposVaziosViramNuloEColunasSaoLidasPeloNome() throws Exception {
        TesouroResponse r = ler("﻿Data Base;Tipo Titulo;Data Vencimento;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha\r\n"
                + "19/11/2026;Tesouro IGPM+ com Juros Semestrais;01/01/2031;;7,75;;8089,65;8089,65\r\n");
        TesouroTitulo t = r.titulos().get(0);
        assertEquals("igpm", t.indexador());
        assertTrue(t.jurosSemestrais());
        assertNull(t.taxaCompra());
        assertEquals(7.75, t.taxaVenda());
    }

    @Test
    void formatoDiferenteFalhaComMensagemClara() {
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> ler("Titulo;Vencimento;Data\nx;y;z\n"));
        assertTrue(e.getMessage().contains("Tipo Titulo"));
        assertThrows(IllegalStateException.class, () -> ler(""));
        assertThrows(IllegalStateException.class, () -> ler(HEADER));
    }
}
