package br.com.painel.service;

import br.com.painel.client.CoinGeckoClient;
import br.com.painel.dto.CryptoPrice;
import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.rest.client.inject.RestClient;

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

    private final CoinGeckoClient client;

    public CryptoService(@RestClient CoinGeckoClient client) {
        this.client = client;
    }

    public List<String> available() {
        return List.copyOf(COINS.keySet());
    }

    public Map<String, CryptoPrice> prices(List<String> symbols) {
        TreeSet<String> ids = new TreeSet<>(symbols.stream().map(COINS::get).filter(Objects::nonNull).toList());
        if (ids.isEmpty()) {
            return Map.of();
        }
        JsonNode data = fetch(String.join(",", ids));
        Map<String, CryptoPrice> out = new LinkedHashMap<>();
        for (String sym : symbols) {
            JsonNode d = data.path(COINS.getOrDefault(sym, ""));
            if (d.path("brl").isNumber() && d.path("brl").asDouble() != 0) {
                JsonNode chg = d.path("brl_24h_change");
                out.put(sym, new CryptoPrice(d.path("brl").asDouble(), chg.isNumber() ? chg.asDouble() : null));
            }
        }
        return out;
    }

    @CacheResult(cacheName = "crypto")
    public JsonNode fetch(String ids) {
        return client.price(ids, "brl", true);
    }

    private static Map<String, String> linked(String... kv) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put(kv[i], kv[i + 1]);
        }
        return m;
    }
}
