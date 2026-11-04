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
    void conditionalWrites() {
        FileDocumentStore store = new FileDocumentStore(dir);
        assertTrue(store.read("u/a.json").isEmpty());

        String v1 = store.write("u/a.json", b("{\"v\":1}"), Condition.absent());
        assertThrows(PreconditionFailedException.class, () -> store.write("u/a.json", b("{}"), Condition.absent()));

        String v2 = store.write("u/a.json", b("{\"v\":2}"), Condition.matches(v1));
        assertNotEquals(v1, v2);
        // a writer still on version 1 cannot overwrite version 2
        assertThrows(PreconditionFailedException.class, () -> store.write("u/a.json", b("{\"v\":3}"), Condition.matches(v1)));
        assertEquals("{\"v\":2}", new String(store.read("u/a.json").orElseThrow().body(), StandardCharsets.UTF_8));

        store.write("u/a.json", b("{\"v\":4}"), Condition.any());
        assertEquals("{\"v\":4}", new String(store.read("u/a.json").orElseThrow().body(), StandardCharsets.UTF_8));
    }

    @Test
    void staysInsideRootFolder() {
        FileDocumentStore store = new FileDocumentStore(dir);
        assertThrows(IllegalArgumentException.class, () -> store.read("../outside.json"));
    }

    @Test
    void listsFolders() {
        FileDocumentStore store = new FileDocumentStore(dir);
        store.write("users/b/a.json", b("{}"), Condition.any());
        store.write("users/a/a.json", b("{}"), Condition.any());
        assertEquals(java.util.List.of("a", "b"), store.listFolders("users"));
        assertEquals(java.util.List.of(), store.listFolders("nothing"));
    }
}
