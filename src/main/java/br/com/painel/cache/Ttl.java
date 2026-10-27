package br.com.painel.cache;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

@FunctionalInterface
public interface Ttl {

    ZoneId B3 = ZoneId.of("America/Sao_Paulo");
    LocalTime ABERTURA = LocalTime.of(10, 0);
    // fechamento com folga: leilão de fechamento e atraso das fontes
    LocalTime FECHAMENTO = LocalTime.of(18, 0);
    Duration COTACAO_PREGAO_ABERTO = Duration.ofMinutes(30);

    boolean fresh(Instant fetchedAt, Instant now);

    static Ttl of(Duration duration) {
        return (fetchedAt, now) -> Duration.between(fetchedAt, now).compareTo(duration) < 0;
    }

    // Com o pregão aberto, 30 min. Fechado, a cotação não muda: vale enquanto tiver sido buscada depois do último fechamento.
    static Ttl cotacao() {
        return (fetchedAt, now) -> {
            if (of(COTACAO_PREGAO_ABERTO).fresh(fetchedAt, now)) {
                return true;
            }
            ZonedDateTime t = now.atZone(B3);
            return !pregaoAberto(t) && !fetchedAt.isBefore(ultimoFechamento(t).toInstant());
        };
    }

    static boolean pregaoAberto(ZonedDateTime t) {
        LocalTime h = t.toLocalTime();
        return diaUtil(t) && !h.isBefore(ABERTURA) && h.isBefore(FECHAMENTO);
    }

    static ZonedDateTime ultimoFechamento(ZonedDateTime t) {
        ZonedDateTime d = t.with(FECHAMENTO);
        if (!diaUtil(t) || t.toLocalTime().isBefore(FECHAMENTO)) {
            d = d.minusDays(1);
        }
        while (!diaUtil(d)) {
            d = d.minusDays(1);
        }
        return d;
    }

    private static boolean diaUtil(ZonedDateTime t) {
        return t.getDayOfWeek() != DayOfWeek.SATURDAY && t.getDayOfWeek() != DayOfWeek.SUNDAY;
    }
}
