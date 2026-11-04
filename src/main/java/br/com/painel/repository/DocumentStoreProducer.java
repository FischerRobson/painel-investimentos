package br.com.painel.repository;

import br.com.painel.config.AppConfig;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.enterprise.inject.Produces;
import software.amazon.awssdk.services.s3.S3Client;

import java.nio.file.Path;

@ApplicationScoped
public class DocumentStoreProducer {

    @Produces
    @ApplicationScoped
    DocumentStore documentStore(AppConfig config, Instance<S3Client> s3) {
        AppConfig.Storage cfg = config.storage();
        return switch (cfg.type()) {
            case "s3" -> new S3DocumentStore(s3.get(), cfg.bucket()
                    .orElseThrow(() -> new IllegalStateException("painel.storage.bucket is required when storage type is s3")));
            case "file" -> new FileDocumentStore(Path.of(cfg.dir()));
            default -> throw new IllegalStateException("invalid painel.storage.type: " + cfg.type());
        };
    }
}
