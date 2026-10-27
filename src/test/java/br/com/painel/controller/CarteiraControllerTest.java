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

/** Fluxo completo com o armazenamento em arquivo (target/test-data). */
@QuarkusTest
class CarteiraControllerTest {

    private static final String CARTEIRA = """
            {"acoesFiis":[{"t":"BBDC4","q":300},{"t":"AAPL","q":4}],
             "cripto":[{"t":"BTC","q":0.015}],
             "rendaFixa":[{"id":"a","nome":"CDB X","tipo":"CDB","idx":"cdi","taxa":110,"aplicado":10000,"data":"2025-06-10","venc":"2027-06-10","isento":false}],
             "moedas":[{"c":"USD","q":300}],
             "bens":[{"id":"car1","type":"cars","brand":"59","model":"5940","year":"2014-3","apelido":"Amarok","hist":{"outubro de 2026":84753}}],
             "preferencias":{"listaPainel":"BBDC4, KNRI11","simulador":{"aporte":1500}}}""";

    @BeforeEach
    void limpa() throws IOException {
        Path dir = Path.of("target/test-data");
        if (Files.exists(dir)) {
            try (var files = Files.walk(dir)) {
                files.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
            }
        }
    }

    @Test
    void criaLeAtualizaEDetectaConflito() {
        given().when().get("/api/carteira").then().statusCode(404);

        // sem precondição → 428
        given().contentType(ContentType.JSON).body(CARTEIRA).when().put("/api/carteira").then().statusCode(428);

        String v1 = given().contentType(ContentType.JSON).header("If-None-Match", "*").body(CARTEIRA)
                .when().put("/api/carteira").then().statusCode(200).header("ETag", notNullValue())
                .extract().path("etag");

        given().when().get("/api/carteira").then().statusCode(200)
                .header("ETag", equalTo("\"" + v1 + "\""))
                .body("acoesFiis[0].t", equalTo("BBDC4"))
                .body("bens[0].hist.'outubro de 2026'", equalTo(84753.0f))
                .body("preferencias.simulador.aporte", equalTo(1500));

        String v2 = given().contentType(ContentType.JSON).header("If-Match", "\"" + v1 + "\"")
                .body(CARTEIRA.replace("\"q\":300", "\"q\":400"))
                .when().put("/api/carteira").then().statusCode(200).extract().path("etag");

        // outro "dispositivo" ainda com a versão 1 → 412
        given().contentType(ContentType.JSON).header("If-Match", "\"" + v1 + "\"").body(CARTEIRA)
                .when().put("/api/carteira").then().statusCode(412).body("error", containsString("outro dispositivo"));

        given().when().get("/api/carteira").then().header("ETag", equalTo("\"" + v2 + "\"")).body("acoesFiis[0].q", equalTo(400.0f));
    }

    @Test
    void validaDados() {
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
    void historicoFazUpsertPorDia() {
        given().contentType(ContentType.JSON).body("{\"t\":1000,\"i\":800}").when().put("/api/historico/2026-10-26").then().statusCode(204);
        given().contentType(ContentType.JSON).body("{\"t\":1100,\"i\":850}").when().put("/api/historico/2026-10-27").then().statusCode(204);
        given().contentType(ContentType.JSON).body("{\"t\":1200,\"i\":900}").when().put("/api/historico/2026-10-27").then().statusCode(204);
        given().when().get("/api/historico").then().statusCode(200)
                .body("'2026-10-26'.t", equalTo(1000.0f)).body("'2026-10-27'.t", equalTo(1200.0f));
        given().contentType(ContentType.JSON).body("{\"t\":1}").when().put("/api/historico/ontem").then().statusCode(400);
    }

    @Test
    void importaEExportaBackupDoFormatoAntigo() {
        String backup = """
                {"app":"painel-acoes","versao":1,"exportadoEm":"2026-10-27T12:00:00Z",
                 "acoesFiis":[{"t":"KNRI11","q":25}],"cripto":[],"rendaFixa":[],"moedas":[{"c":"USD","q":300}],"bens":[],
                 "historico":{"2026-10-20":{"t":50000,"i":40000}},"listaPainel":"BBDC4, KNRI11"}""";
        given().contentType(ContentType.JSON).body(backup).when().post("/api/backup/import").then().statusCode(204);
        given().when().get("/api/carteira").then().statusCode(200)
                .body("acoesFiis[0].t", equalTo("KNRI11")).body("preferencias.listaPainel", equalTo("BBDC4, KNRI11"));
        given().when().get("/api/backup").then().statusCode(200)
                .body("app", equalTo("painel-acoes")).body("historico", hasKey("2026-10-20")).body("moedas[0].c", equalTo("USD"));
        given().contentType(ContentType.JSON).body("{\"qualquer\":1}").when().post("/api/backup/import").then().statusCode(400);
    }
}
