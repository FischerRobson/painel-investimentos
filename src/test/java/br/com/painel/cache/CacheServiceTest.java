package br.com.painel.cache;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CacheServiceTest {

    static final TypeReference<String> STRING = new TypeReference<>() {
    };
    static final Ttl DEZ_MIN = Ttl.of(Duration.ofMinutes(10));

    static class RelogioAjustavel extends Clock {
        Instant agora = Instant.parse("2026-10-27T15:00:00Z");

        void avanca(Duration d) {
            agora = agora.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return agora;
        }
    }

    RelogioAjustavel relogio;
    MemorySharedCache compartilhado;
    CacheService cache;
    AtomicInteger chamadas;

    @BeforeEach
    void setUp() {
        relogio = new RelogioAjustavel();
        compartilhado = new MemorySharedCache();
        cache = new CacheService(compartilhado, new ObjectMapper(), relogio);
        chamadas = new AtomicInteger();
    }

    String fonte() {
        return "valor " + chamadas.incrementAndGet();
    }

    @Test
    void dentroDaValidadeNaoConsultaAFonte() {
        assertEquals("valor 1", cache.get("k", DEZ_MIN, STRING, false, this::fonte).value());
        relogio.avanca(Duration.ofMinutes(9));
        Cached<String> c = cache.get("k", DEZ_MIN, STRING, false, this::fonte);
        assertEquals("valor 1", c.value());
        assertEquals(relogio.agora.minus(Duration.ofMinutes(9)).toEpochMilli(), c.fetchedAt());
        assertEquals(1, chamadas.get());

        relogio.avanca(Duration.ofMinutes(2));
        assertEquals("valor 2", cache.get("k", DEZ_MIN, STRING, false, this::fonte).value());
    }

    @Test
    void atualizarSoBuscaDeNovoDepoisDeDoisMinutos() {
        cache.get("k", DEZ_MIN, STRING, false, this::fonte);
        relogio.avanca(Duration.ofMinutes(1));
        assertEquals("valor 1", cache.get("k", DEZ_MIN, STRING, true, this::fonte).value());
        relogio.avanca(Duration.ofMinutes(1));
        assertEquals("valor 2", cache.get("k", DEZ_MIN, STRING, true, this::fonte).value());
    }

    @Test
    void fonteForaDoArDevolveOUltimoValorComoVencido() {
        cache.get("k", DEZ_MIN, STRING, false, this::fonte);
        relogio.avanca(Duration.ofHours(1));
        Cached<String> c = cache.get("k", DEZ_MIN, STRING, false, () -> {
            throw new IllegalStateException("brapi fora do ar");
        });
        assertEquals("valor 1", c.value());
        assertTrue(c.stale());
    }

    @Test
    void semValorAnteriorAFalhaSobe() {
        assertThrows(IllegalStateException.class, () -> cache.get("k", DEZ_MIN, STRING, false, () -> {
            throw new IllegalStateException("fora do ar");
        }));
    }

    @Test
    void outraInstanciaAproveitaOCacheCompartilhado() {
        cache.get("k", DEZ_MIN, STRING, false, this::fonte);
        CacheService outraInstancia = new CacheService(compartilhado, new ObjectMapper(), relogio);
        Cached<String> c = outraInstancia.get("k", DEZ_MIN, STRING, false, this::fonte);
        assertEquals("valor 1", c.value());
        assertFalse(c.stale());
        assertEquals(1, chamadas.get());
    }

    @Test
    void peekNaoConsultaAFonte() {
        assertTrue(cache.peek("k", STRING).isEmpty());
        cache.get("k", DEZ_MIN, STRING, false, this::fonte);
        assertEquals("valor 1", cache.peek("k", STRING).orElseThrow().value());
        assertEquals(1, chamadas.get());
    }
}
