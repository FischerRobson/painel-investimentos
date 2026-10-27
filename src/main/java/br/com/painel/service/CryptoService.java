package br.com.painel.service;

import br.com.painel.cache.CacheService;
import br.com.painel.cache.Cached;
import br.com.painel.cache.Ttl;
import br.com.painel.client.CoinGeckoClient;
import br.com.painel.dto.CryptoPrice;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.rest.client.inject.RestClient;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;

@ApplicationScoped
public class CryptoService {

    public static final Map<String, String> COINS = linked(
            "BTC", "bitcoin", "ETH", "ethereum", "SOL", "solana", "USDT", "tether", "USDC", "usd-coin",
            "XRP", "ripple", "BNB", "binancecoin", "ADA", "cardano", "DOGE", "dogecoin", "LINK", "chainlink");

    private static final TypeReference<JsonNode> JSON = new TypeReference<>() {
    };

    private final CoinGeckoClient client;
    private final CacheService cache;

    public CryptoService(@RestClient CoinGeckoClient client, CacheService cache) {
        this.client = client;
        this.cache = cache;
    }

    public List<String> available() {
        return List.copyOf(COINS.keySet());
    }

    public Cached<Map<String, CryptoPrice>> prices(List<String> symbols, boolean refresh) {
        TreeSet<String> ids = new TreeSet<>(symbols.stream().map(COINS::get).filter(Objects::nonNull).toList());
        if (ids.isEmpty()) {
            return new Cached<>(Map.of(), System.currentTimeMillis(), false);
        }
        String key = String.join(",", ids);
        Cached<JsonNode> cached = cache.get("crypto:" + key, Ttl.of(Duration.ofMinutes(5)), JSON, refresh,
                () -> client.price(key, "brl", true));
        JsonNode data = cached.value();
        Map<String, CryptoPrice> out = new LinkedHashMap<>();
        for (String sym : symbols) {
            JsonNode d = data.path(COINS.getOrDefault(sym, ""));
            if (d.path("brl").isNumber() && d.path("brl").asDouble() != 0) {
                JsonNode chg = d.path("brl_24h_change");
                out.put(sym, new CryptoPrice(d.path("brl").asDouble(), chg.isNumber() ? chg.asDouble() : null));
            }
        }
        return new Cached<>(out, cached.fetchedAt(), cached.stale());
    }

    private static Map<String, String> linked(String... kv) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put(kv[i], kv[i + 1]);
        }
        return m;
    }
}
