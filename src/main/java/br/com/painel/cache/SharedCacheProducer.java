package br.com.painel.cache;

import br.com.painel.config.PainelConfig;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.enterprise.inject.Produces;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;

@ApplicationScoped
public class SharedCacheProducer {

    @Produces
    @ApplicationScoped
    SharedCache sharedCache(PainelConfig config, Instance<DynamoDbClient> dynamo) {
        return config.cache().table()
                .<SharedCache>map(table -> new DynamoSharedCache(dynamo.get(), table))
                .orElseGet(MemorySharedCache::new);
    }
}
