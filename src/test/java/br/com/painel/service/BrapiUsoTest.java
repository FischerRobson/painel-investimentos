package br.com.painel.service;

import br.com.painel.dto.BrapiUso;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class BrapiUsoTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void leOConsumoDaRespostaDaBrapi() throws Exception {
        // Formato real de GET /api/v2/user/usage (out/2026)
        BrapiUso u = BrapiService.parseUso(JSON.readTree("""
                {"usage":{"planName":"free","planLimit":15000,"currentUsage":215,"remainingUsage":14785,
                 "usageWindow":{"type":"rolling-30d","start":"2026-09-28T00:00:00.000Z","end":"2026-10-28T19:37:53.979Z"},
                 "subscriptionPeriod":{"start":null,"end":null}},"requestedAt":"2026-10-28T19:37:53.988Z","took":15}
                """), 42L);
        assertEquals(new BrapiUso(true, "free", 15000L, 215L, 14785L, "rolling-30d",
                "2026-09-28T00:00:00.000Z", "2026-10-28T19:37:53.979Z", 42L), u);
    }

    @Test
    void calculaORestanteQuandoFalta() throws Exception {
        BrapiUso u = BrapiService.parseUso(JSON.readTree("{\"usage\":{\"planLimit\":100,\"currentUsage\":130}}"), 0L);
        assertEquals(0L, u.restante());
    }

    @Test
    void recusaRespostaSemConsumo() throws Exception {
        assertThrows(BrapiService.BrapiException.class, () -> BrapiService.parseUso(JSON.readTree("{\"message\":\"x\"}"), 0L));
    }
}
