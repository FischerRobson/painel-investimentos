package br.com.painel.cache;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

// Cache em duas camadas para as fontes externas:
//   L1: memória da instância (Caffeine);  L2: compartilhado entre instâncias (DynamoDB).
// - Se a fonte falha, devolve o último valor conhecido marcado como vencido (stale), em vez de erro.
// - "Atualizar" (refresh) só busca de novo se o dado tiver mais de 2 min: protege a cota da brapi.
// - Buscas simultâneas da mesma chave na mesma instância viram uma só.
@ApplicationScoped
public class CacheService {

    public static final Duration REFRESH_MIN_AGE = Duration.ofMinutes(2);
    // o L2 guarda o valor por mais tempo que a validade, para servir de reserva quando a fonte cair
    static final Duration KEEP_FOR_FALLBACK = Duration.ofDays(7);
    // muda quando o formato dos valores mudar, para não ler entradas antigas
    private static final String VERSION = "v1:";
    private static final Logger LOG = Logger.getLogger(CacheService.class);

    private record Local(Object value, long fetchedAt) {
    }

    private final SharedCache l2;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Cache<String, Local> l1 = Caffeine.newBuilder().maximumSize(2_000).build();
    private final ConcurrentHashMap<String, CompletableFuture<Local>> inflight = new ConcurrentHashMap<>();

    @Inject
    public CacheService(SharedCache l2, ObjectMapper mapper) {
        this(l2, mapper, Clock.systemUTC());
    }

    CacheService(SharedCache l2, ObjectMapper mapper, Clock clock) {
        this.l2 = l2;
        this.mapper = mapper;
        this.clock = clock;
    }

    public <T> Cached<T> get(String key, Ttl ttl, TypeReference<T> type, boolean refresh, Supplier<T> loader) {
        String k = VERSION + key;
        Instant now = clock.instant();
        Local best = l1.getIfPresent(k);
        if (best == null || !ttl.fresh(Instant.ofEpochMilli(best.fetchedAt()), now) || refresh) {
            Local remote = fromL2(k, type);
            if (remote != null && (best == null || remote.fetchedAt() > best.fetchedAt())) {
                best = remote;
                l1.put(k, best);
            }
        }
        if (best != null) {
            Instant fetchedAt = Instant.ofEpochMilli(best.fetchedAt());
            boolean refreshAllowed = refresh && Duration.between(fetchedAt, now).compareTo(REFRESH_MIN_AGE) >= 0;
            if (ttl.fresh(fetchedAt, now) && !refreshAllowed) {
                return cached(best, false);
            }
        }
        try {
            return cached(load(k, loader), false);
        } catch (RuntimeException e) {
            if (best != null) {
                LOG.warnf("Fonte falhou para %s; usando valor de %s: %s", key, Instant.ofEpochMilli(best.fetchedAt()), e.getMessage());
                return cached(best, true);
            }
            throw e;
        }
    }

    // Último valor conhecido, sem consultar a fonte (usado quando a cota da brapi está acabando).
    public <T> Optional<Cached<T>> peek(String key, TypeReference<T> type) {
        String k = VERSION + key;
        Local best = l1.getIfPresent(k);
        if (best == null) {
            best = fromL2(k, type);
        }
        return Optional.ofNullable(best).map(l -> cached(l, true));
    }

    private Local load(String k, Supplier<?> loader) {
        CompletableFuture<Local> mine = new CompletableFuture<>();
        CompletableFuture<Local> running = inflight.putIfAbsent(k, mine);
        if (running != null) {
            try {
                return running.join();
            } catch (CompletionException e) {
                throw e.getCause() instanceof RuntimeException re ? re : e;
            }
        }
        try {
            Object value = loader.get();
            Local local = new Local(value, clock.millis());
            l1.put(k, local);
            l2.put(k, mapper.writeValueAsBytes(value), local.fetchedAt(),
                    clock.instant().plus(KEEP_FOR_FALLBACK).getEpochSecond());
            mine.complete(local);
            return local;
        } catch (IOException e) {
            mine.completeExceptionally(e);
            throw new IllegalStateException(e);
        } catch (RuntimeException e) {
            mine.completeExceptionally(e);
            throw e;
        } finally {
            inflight.remove(k, mine);
        }
    }

    private Local fromL2(String k, TypeReference<?> type) {
        return l2.get(k).map(entry -> {
            try {
                JavaType javaType = mapper.getTypeFactory().constructType(type);
                return new Local(mapper.readValue(entry.value(), javaType), entry.fetchedAt());
            } catch (IOException e) {
                LOG.warnf("Entrada ilegível no cache compartilhado (%s), ignorando: %s", k, e.getMessage());
                return null;
            }
        }).orElse(null);
    }

    @SuppressWarnings("unchecked")
    private static <T> Cached<T> cached(Local local, boolean stale) {
        return new Cached<>((T) local.value(), local.fetchedAt(), stale);
    }
}
