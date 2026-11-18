package br.com.painel.service;

import br.com.painel.dto.FocusPoint;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class TermometroServiceTest {

    private static final String FOCUS = """
        {"value":[
          {"Indicador":"IPCA","Data":"2026-11-13","DataReferencia":"2026","Mediana":5.1,"Minimo":4.7,"Maximo":5.8,"baseCalculo":0},
          {"Indicador":"IPCA","Data":"2026-11-13","DataReferencia":"2027","Mediana":4.9,"Minimo":3.5,"Maximo":6.4,"baseCalculo":0},
          {"Indicador":"IPCA","Data":"2026-11-13","DataReferencia":"2028","Mediana":4.0,"Minimo":3.0,"Maximo":5.0,"baseCalculo":0},
          {"Indicador":"Selic","Data":"2026-11-13","DataReferencia":"2027","Mediana":12.25,"Minimo":11.0,"Maximo":13.5,"baseCalculo":0},
          {"Indicador":"Selic","Data":"2026-10-30","DataReferencia":"2027","Mediana":99.0,"Minimo":null,"Maximo":null},
          {"Indicador":"IPCA","Data":"2026-11-13","DataReferencia":"2019","Mediana":1.0,"baseCalculo":0},
          {"Indicador":"IPCA","Data":"2026-11-13","DataReferencia":"2026","Mediana":9.9,"Minimo":9.9,"Maximo":9.9,"baseCalculo":1}
        ]}""";

    @Test
    void mantemSoAUltimaEdicaoEOsAnosDaJanela() throws Exception {
        List<FocusPoint> out = new ArrayList<>();
        String data = TermometroService.escolherUltimaEdicao(new ObjectMapper().readTree(FOCUS), 2026, out);
        assertEquals("2026-11-13", data);
        assertEquals(4, out.size()); // a linha com baseCalculo 1 fica de fora
        assertEquals(new FocusPoint("IPCA", "2026", 5.1, 4.7, 5.8), out.get(0));
        assertEquals(new FocusPoint("IPCA", "2027", 4.9, 3.5, 6.4), out.get(1));
        assertEquals(new FocusPoint("IPCA", "2028", 4.0, 3.0, 5.0), out.get(2));
        assertEquals(new FocusPoint("Selic", "2027", 12.25, 11.0, 13.5), out.get(3));
    }

    @Test
    void semLinhasNaoHaEdicao() throws Exception {
        List<FocusPoint> out = new ArrayList<>();
        assertNull(TermometroService.escolherUltimaEdicao(new ObjectMapper().readTree("{\"value\":[]}"), 2026, out));
        assertEquals(0, out.size());
    }
}
