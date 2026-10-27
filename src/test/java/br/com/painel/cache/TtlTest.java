package br.com.painel.cache;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZonedDateTime;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TtlTest {

    static Instant b3(String dataHora) {
        return ZonedDateTime.parse(dataHora + "-03:00[America/Sao_Paulo]").toInstant();
    }

    final Ttl cotacao = Ttl.cotacao();

    @Test
    void pregaoAbertoVale30Minutos() {
        // terça-feira, 27/10/2026
        assertTrue(cotacao.fresh(b3("2026-10-27T11:00:00"), b3("2026-10-27T11:29:00")));
        assertFalse(cotacao.fresh(b3("2026-10-27T11:00:00"), b3("2026-10-27T11:31:00")));
    }

    @Test
    void depoisDoFechamentoValeAteAProximaAbertura() {
        assertTrue(cotacao.fresh(b3("2026-10-27T18:05:00"), b3("2026-10-28T09:59:00")));
        assertFalse(cotacao.fresh(b3("2026-10-27T18:05:00"), b3("2026-10-28T10:31:00")));
    }

    @Test
    void cotacaoDeAntesDoFechamentoNaoServeDepoisDele() {
        assertFalse(cotacao.fresh(b3("2026-10-27T17:00:00"), b3("2026-10-27T20:00:00")));
    }

    @Test
    void fimDeSemanaUsaACotacaoDeSextaDepoisDoFechamento() {
        // sexta 30/10 às 18h30 → sábado e domingo continuam válidos
        assertTrue(cotacao.fresh(b3("2026-10-30T18:30:00"), b3("2026-11-01T15:00:00")));
        assertFalse(cotacao.fresh(b3("2026-10-30T16:00:00"), b3("2026-11-01T15:00:00")));
    }
}
