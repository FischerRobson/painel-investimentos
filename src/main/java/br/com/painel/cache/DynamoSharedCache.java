package br.com.painel.cache;

import org.jboss.logging.Logger;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Map;
import java.util.Optional;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

// Itens: k (chave), v (JSON compactado com gzip: o limite do DynamoDB é 400 KB por item),
// f (hora da busca, ms) e expiraEm (TTL nativo do DynamoDB, em segundos).
// Falhas aqui viram "não está no cache": o app continua funcionando, só consulta mais a fonte.
public class DynamoSharedCache implements SharedCache {

    private static final Logger LOG = Logger.getLogger(DynamoSharedCache.class);

    private final DynamoDbClient dynamo;
    private final String table;

    public DynamoSharedCache(DynamoDbClient dynamo, String table) {
        this.dynamo = dynamo;
        this.table = table;
    }

    @Override
    public Optional<Entry> get(String key) {
        try {
            Map<String, AttributeValue> item = dynamo.getItem(b -> b.tableName(table).key(Map.of("k", s(key)))).item();
            if (item == null || item.isEmpty()) {
                return Optional.empty();
            }
            return Optional.of(new Entry(gunzip(item.get("v").b().asByteArray()), Long.parseLong(item.get("f").n())));
        } catch (RuntimeException e) {
            LOG.warnf("Cache compartilhado indisponível (leitura de %s): %s", key, e.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public void put(String key, byte[] value, long fetchedAt, long expiresAtEpochSecond) {
        try {
            dynamo.putItem(b -> b.tableName(table).item(Map.of(
                    "k", s(key),
                    "v", AttributeValue.fromB(SdkBytes.fromByteArray(gzip(value))),
                    "f", n(fetchedAt),
                    "expiraEm", n(expiresAtEpochSecond))));
        } catch (RuntimeException e) {
            LOG.warnf("Cache compartilhado indisponível (gravação de %s): %s", key, e.getMessage());
        }
    }

    private static AttributeValue s(String v) {
        return AttributeValue.fromS(v);
    }

    private static AttributeValue n(long v) {
        return AttributeValue.fromN(Long.toString(v));
    }

    private static byte[] gzip(byte[] data) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream(); GZIPOutputStream gz = new GZIPOutputStream(out)) {
            gz.write(data);
            gz.finish();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static byte[] gunzip(byte[] data) {
        try (GZIPInputStream gz = new GZIPInputStream(new ByteArrayInputStream(data))) {
            return gz.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
