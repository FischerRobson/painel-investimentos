package br.com.painel.repository;

import br.com.painel.repository.DocumentStore.Condition;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FileDocumentStoreTest {

    @TempDir
    Path dir;

    private static byte[] b(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void escritaCondicional() {
        FileDocumentStore store = new FileDocumentStore(dir);
        assertTrue(store.read("u/a.json").isEmpty());

        String v1 = store.write("u/a.json", b("{\"v\":1}"), Condition.absent());
        assertThrows(PreconditionFailedException.class, () -> store.write("u/a.json", b("{}"), Condition.absent()));

        String v2 = store.write("u/a.json", b("{\"v\":2}"), Condition.matches(v1));
        assertNotEquals(v1, v2);
        // quem ainda tem a versão 1 não pode sobrescrever a 2
        assertThrows(PreconditionFailedException.class, () -> store.write("u/a.json", b("{\"v\":3}"), Condition.matches(v1)));
        assertEquals("{\"v\":2}", new String(store.read("u/a.json").orElseThrow().body(), StandardCharsets.UTF_8));

        store.write("u/a.json", b("{\"v\":4}"), Condition.any());
        assertEquals("{\"v\":4}", new String(store.read("u/a.json").orElseThrow().body(), StandardCharsets.UTF_8));
    }

    @Test
    void naoSaiDaPastaRaiz() {
        FileDocumentStore store = new FileDocumentStore(dir);
        assertThrows(IllegalArgumentException.class, () -> store.read("../fora.json"));
    }
}
