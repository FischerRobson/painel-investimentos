package br.com.painel.service;

import br.com.painel.config.PainelConfig;
import br.com.painel.model.Backup;
import br.com.painel.model.Carteira;
import br.com.painel.model.Posicao;
import br.com.painel.model.Snapshot;
import br.com.painel.repository.DocumentStore;
import br.com.painel.repository.DocumentStore.Condition;
import br.com.painel.repository.DocumentStore.Document;
import br.com.painel.repository.PreconditionFailedException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.ApplicationScoped;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.regex.Pattern;

@ApplicationScoped
public class CarteiraService {

    public record Versionado<T>(T value, String etag) {
    }

    private static final TypeReference<TreeMap<String, Snapshot>> HISTORICO = new TypeReference<>() {
    };
    private static final int TENTATIVAS_HISTORICO = 3;
    private static final Pattern DONO_VALIDO = Pattern.compile("[A-Za-z0-9-]{1,64}");

    private final DocumentStore store;
    private final ObjectMapper mapper;
    private final PainelConfig config;
    private final SecurityIdentity identity;

    public CarteiraService(DocumentStore store, ObjectMapper mapper, PainelConfig config, SecurityIdentity identity) {
        this.store = store;
        this.mapper = mapper;
        this.config = config;
        this.identity = identity;
    }

    public Optional<Versionado<Carteira>> carteira() {
        return store.read(carteiraKey()).map(d -> new Versionado<>(parse(d.body(), Carteira.class), d.etag()));
    }

    public String salvar(Carteira carteira, Condition condition) {
        validar(carteira);
        return store.write(carteiraKey(), json(carteira), condition);
    }

    public Map<String, Snapshot> historico() {
        return store.read(historicoKey()).map(d -> (Map<String, Snapshot>) parseHistorico(d)).orElseGet(TreeMap::new);
    }

    public void registrarSnapshot(String data, Snapshot snapshot) {
        for (int tentativa = 1; ; tentativa++) {
            Optional<Document> atual = store.read(historicoKey());
            TreeMap<String, Snapshot> historico = atual.map(this::parseHistorico).orElseGet(TreeMap::new);
            historico.put(data, snapshot);
            Condition cond = atual.map(d -> Condition.matches(d.etag())).orElseGet(Condition::absent);
            try {
                store.write(historicoKey(), json(historico), cond);
                return;
            // conflito: relê e tenta de novo (o upsert de um dia não perde dados de outros dias)
            } catch (PreconditionFailedException e) {
                if (tentativa >= TENTATIVAS_HISTORICO) {
                    throw e;
                }
            }
        }
    }

    public Backup exportar() {
        Carteira c = carteira().map(Versionado::value).orElseGet(() -> new Carteira(null, null, null, null, null, null));
        Object lista = c.preferencias().get("listaPainel");
        return new Backup("painel-acoes", 2, Instant.now().toString(), c.acoesFiis(), c.cripto(), c.rendaFixa(),
                c.moedas(), c.bens(), historico(), lista instanceof String s ? s : null, c.preferencias());
    }

    public void importar(Backup b) {
        Map<String, Object> prefs = new LinkedHashMap<>(b.preferencias() == null ? Map.of() : b.preferencias());
        if (b.listaPainel() != null && !b.listaPainel().isBlank()) {
            prefs.put("listaPainel", b.listaPainel());
        }
        Carteira carteira = new Carteira(b.acoesFiis(), b.cripto(), b.rendaFixa(), b.moedas(), b.bens(), prefs);
        validar(carteira);
        store.write(carteiraKey(), json(carteira), Condition.any());
        store.write(historicoKey(), json(new TreeMap<>(b.historico() == null ? Map.of() : b.historico())), Condition.any());
    }

    private void validar(Carteira c) {
        for (Posicao p : c.cripto()) {
            if (!CryptoService.COINS.containsKey(p.t())) {
                throw new InvalidDataException("cripto não suportada: " + p.t());
            }
        }
    }

    private String carteiraKey() {
        return "users/" + dono() + "/carteira.json";
    }

    private String historicoKey() {
        return "users/" + dono() + "/historico.json";
    }

    // No Lambda, o sub do token do Cognito (cada usuário tem sua pasta); localmente, sem login, o dono fixo da config.
    private String dono() {
        String dono = identity.isAnonymous() ? config.storage().owner() : identity.getPrincipal().getName();
        if (!DONO_VALIDO.matcher(dono).matches()) {
            throw new IllegalStateException("identificador de usuário inesperado");
        }
        return dono;
    }

    private TreeMap<String, Snapshot> parseHistorico(Document d) {
        try {
            return mapper.readValue(d.body(), HISTORICO);
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
