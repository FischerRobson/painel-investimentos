package br.com.painel.repository;

import br.com.painel.model.KnownPrice;
import br.com.painel.model.Snapshot;
import br.com.painel.model.Wallet;
import br.com.painel.repository.DocumentStore.Condition;
import br.com.painel.repository.DocumentStore.Document;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.function.Consumer;
import java.util.regex.Pattern;

@ApplicationScoped
public class UserDataRepository {

    public record Versioned<T>(T value, String etag) {
    }

    private static final String USERS = "users";
    private static final TypeReference<TreeMap<String, Snapshot>> HISTORY = new TypeReference<>() {
    };
    private static final TypeReference<TreeMap<String, KnownPrice>> PRICES = new TypeReference<>() {
    };
    private static final int UPDATE_ATTEMPTS = 3;
    private static final Pattern VALID_OWNER = Pattern.compile("[A-Za-z0-9-]{1,64}");

    private final DocumentStore store;
    private final ObjectMapper mapper;

    public UserDataRepository(DocumentStore store, ObjectMapper mapper) {
        this.store = store;
        this.mapper = mapper;
    }

    public List<String> owners() {
        return store.listFolders(USERS).stream().filter(o -> VALID_OWNER.matcher(o).matches()).toList();
    }

    public Optional<Versioned<Wallet>> wallet(String owner) {
        return store.read(walletKey(owner)).map(d -> new Versioned<>(parse(d.body(), Wallet.class), d.etag()));
    }

    public String saveWallet(String owner, Wallet wallet, Condition condition) {
        return store.write(walletKey(owner), json(wallet), condition);
    }

    public Map<String, Snapshot> history(String owner) {
        return store.read(historyKey(owner)).map(d -> (Map<String, Snapshot>) parse(d, HISTORY)).orElseGet(TreeMap::new);
    }

    public void replaceHistory(String owner, Map<String, Snapshot> history) {
        store.write(historyKey(owner), json(new TreeMap<>(history)), Condition.any());
    }

    public void putSnapshot(String owner, String date, Snapshot snapshot) {
        update(historyKey(owner), HISTORY, history -> history.put(date, snapshot));
    }

    public Map<String, KnownPrice> prices(String owner) {
        return store.read(pricesKey(owner)).map(d -> (Map<String, KnownPrice>) parse(d, PRICES)).orElseGet(TreeMap::new);
    }

    public void putPrices(String owner, Map<String, KnownPrice> prices) {
        update(pricesKey(owner), PRICES, current -> current.putAll(prices));
    }

    // Read-modify-write with optimistic locking: on conflict, read again and retry so concurrent writers keep each other's entries
    private <V> void update(String key, TypeReference<TreeMap<String, V>> type, Consumer<TreeMap<String, V>> change) {
        for (int attempt = 1; ; attempt++) {
            Optional<Document> current = store.read(key);
            TreeMap<String, V> map = current.map(d -> parse(d, type)).orElseGet(TreeMap::new);
            change.accept(map);
            Condition condition = current.map(d -> Condition.matches(d.etag())).orElseGet(Condition::absent);
            try {
                store.write(key, json(map), condition);
                return;
            } catch (PreconditionFailedException e) {
                if (attempt >= UPDATE_ATTEMPTS) {
                    throw e;
                }
            }
        }
    }

    private static String walletKey(String owner) {
        return folder(owner) + "/carteira.json";
    }

    private static String historyKey(String owner) {
        return folder(owner) + "/historico.json";
    }

    private static String pricesKey(String owner) {
        return folder(owner) + "/precos.json";
    }

    private static String folder(String owner) {
        if (owner == null || !VALID_OWNER.matcher(owner).matches()) {
            throw new IllegalStateException("unexpected user id");
        }
        return USERS + "/" + owner;
    }

    private <T> T parse(Document d, TypeReference<T> type) {
        try {
            return mapper.readValue(d.body(), type);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private <T> T parse(byte[] body, Class<T> type) {
        try {
            return mapper.readValue(body, type);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private byte[] json(Object value) {
        try {
            return mapper.writeValueAsBytes(value);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
