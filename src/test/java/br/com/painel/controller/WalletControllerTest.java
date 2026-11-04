package br.com.painel.controller;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.notNullValue;

// Full flow with the file store (target/test-data).
@QuarkusTest
class WalletControllerTest {

    private static final String WALLET = """
            {"acoesFiis":[{"t":"BBDC4","q":300},{"t":"AAPL","q":4}],
             "cripto":[{"t":"BTC","q":0.015}],
             "rendaFixa":[{"id":"a","nome":"CDB X","tipo":"CDB","idx":"cdi","taxa":110,"aplicado":10000,"data":"2025-06-10","venc":"2027-06-10","isento":false}],
             "moedas":[{"c":"USD","q":300}],
             "bens":[{"id":"car1","type":"cars","brand":"59","model":"5940","year":"2014-3","apelido":"Amarok","hist":{"outubro de 2026":84753}}],
             "preferencias":{"listaPainel":"BBDC4, KNRI11","simulador":{"aporte":1500}}}""";

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
    void createsReadsUpdatesAndDetectsConflicts() {
        given().when().get("/api/carteira").then().statusCode(404);

        // no precondition -> 428
        given().contentType(ContentType.JSON).body(WALLET).when().put("/api/carteira").then().statusCode(428);

        String v1 = given().contentType(ContentType.JSON).header("If-None-Match", "*").body(WALLET)
                .when().put("/api/carteira").then().statusCode(200).header("ETag", notNullValue())
                .extract().path("etag");

        given().when().get("/api/carteira").then().statusCode(200)
                .header("ETag", equalTo("\"" + v1 + "\""))
                .body("acoesFiis[0].t", equalTo("BBDC4"))
                .body("bens[0].hist.'outubro de 2026'", equalTo(84753.0f))
                .body("preferencias.simulador.aporte", equalTo(1500));

        String v2 = given().contentType(ContentType.JSON).header("If-Match", "\"" + v1 + "\"")
                .body(WALLET.replace("\"q\":300", "\"q\":400"))
                .when().put("/api/carteira").then().statusCode(200).extract().path("etag");

        // another "device" still on version 1 -> 412
        given().contentType(ContentType.JSON).header("If-Match", "\"" + v1 + "\"").body(WALLET)
                .when().put("/api/carteira").then().statusCode(412).body("error", containsString("outro dispositivo"));

        given().when().get("/api/carteira").then().header("ETag", equalTo("\"" + v2 + "\"")).body("acoesFiis[0].q", equalTo(400.0f));
    }

    @Test
    void validatesData() {
        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body("{\"acoesFiis\":[{\"t\":\"<script>\",\"q\":-1}]}")
                .when().put("/api/carteira").then().statusCode(400);
        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body("{\"cripto\":[{\"t\":\"FAKECOIN\",\"q\":1}]}")
                .when().put("/api/carteira").then().statusCode(400).body("error", containsString("FAKECOIN"));
        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body("{\"bens\":[{\"id\":\"x\",\"type\":\"cars\",\"brand\":\"../..\",\"model\":\"1\",\"year\":\"1\"}]}")
                .when().put("/api/carteira").then().statusCode(400);
    }

    @Test
    void historyIsReadOnlyForTheBrowser() {
        given().contentType(ContentType.JSON).body("{\"t\":1000}").when().put("/api/historico/2026-10-26").then().statusCode(org.hamcrest.Matchers.anyOf(equalTo(404), equalTo(405)));
        given().when().get("/api/historico").then().statusCode(200);
    }

    @Test
    void importsAndExportsLegacyBackup() {
        String backup = """
                {"app":"painel-acoes","versao":1,"exportadoEm":"2026-10-27T12:00:00Z",
                 "acoesFiis":[{"t":"KNRI11","q":25}],"cripto":[],"rendaFixa":[],"moedas":[{"c":"USD","q":300}],"bens":[],
                 "historico":{"2026-10-20":{"t":50000,"i":40000,"stale":[{"asset":"BTC","since":"2026-10-19"}]}},"listaPainel":"BBDC4, KNRI11"}""";
        given().contentType(ContentType.JSON).body(backup).when().post("/api/backup/import").then().statusCode(204);
        given().when().get("/api/carteira").then().statusCode(200)
                .body("acoesFiis[0].t", equalTo("KNRI11")).body("preferencias.listaPainel", equalTo("BBDC4, KNRI11"));
        given().when().get("/api/backup").then().statusCode(200)
                .body("app", equalTo("painel-acoes")).body("historico", hasKey("2026-10-20")).body("moedas[0].c", equalTo("USD"))
                .body("historico.'2026-10-20'.stale[0].asset", equalTo("BTC"));
        given().contentType(ContentType.JSON).body("{\"qualquer\":1}").when().post("/api/backup/import").then().statusCode(400);
    }
}
