package br.com.painel.controller;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

@QuarkusTest
class SnapshotControllerTest {

    @BeforeEach
    void clean() throws IOException {
        Path dir = Path.of("target/test-data");
        if (Files.exists(dir)) {
            try (var files = Files.walk(dir)) {
                files.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
            }
        }
    }

    @Test
    void requiresTheSchedulerToken() {
        given().when().post("/internal/snapshots").then().statusCode(404);
        given().header(SnapshotController.TOKEN_HEADER, "wrong").when().post("/internal/snapshots").then().statusCode(404);
    }

    @Test
    void runsWithTheToken() {
        given().header(SnapshotController.TOKEN_HEADER, "test-token").when().post("/internal/snapshots")
                .then().statusCode(200).body("users", equalTo(0)).body("failed", equalTo(0));
    }
}
