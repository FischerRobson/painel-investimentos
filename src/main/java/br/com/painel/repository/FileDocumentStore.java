package br.com.painel.repository;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.stream.Stream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.locks.ReentrantLock;

// Local development store. ETag = SHA-256 of the content; the lock only guarantees compare-and-set within one process.
public class FileDocumentStore implements DocumentStore {

    private final Path root;
    private final ReentrantLock lock = new ReentrantLock();

    public FileDocumentStore(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    @Override
    public Optional<Document> read(String key) {
        Path file = resolve(key);
        if (!Files.exists(file)) {
            return Optional.empty();
        }
        try {
            byte[] body = Files.readAllBytes(file);
            return Optional.of(new Document(body, etag(body)));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public String write(String key, byte[] body, Condition condition) {
        Path file = resolve(key);
        lock.lock();
        try {
            Optional<Document> current = read(key);
            boolean ok = switch (condition.kind()) {
                case ANY -> true;
                case ABSENT -> current.isEmpty();
                case MATCH -> current.isPresent() && current.get().etag().equals(condition.etag());
            };
            if (!ok) {
                throw new PreconditionFailedException(key);
            }
            Files.createDirectories(file.getParent());
            Path tmp = Files.createTempFile(file.getParent(), ".tmp-", ".json");
            Files.write(tmp, body);
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
            return etag(body);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } finally {
            lock.unlock();
        }
    }

    @Override
    public List<String> listFolders(String prefix) {
        Path dir = resolve(prefix);
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        try (Stream<Path> children = Files.list(dir)) {
            return children.filter(Files::isDirectory).map(p -> p.getFileName().toString()).sorted().toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    // Keeps keys inside the root folder (e.g. "../../etc/passwd")
    private Path resolve(String key) {
        Path file = root.resolve(key).normalize();
        if (!file.startsWith(root)) {
            throw new IllegalArgumentException("invalid key: " + key);
        }
        return file;
    }

    private static String etag(byte[] body) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
