package br.com.painel.demo;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.notNullValue;

// Nenhum destes testes acessa a rede: no modo demonstração as fontes externas não são consultadas.
@QuarkusTest
class DemoFilterTest {

    static final String DEMO = DemoFilter.HEADER;

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
    void carteiraDemonstracaoSemTocarNosDadosReais() {
        given().header(DEMO, "1").when().get("/api/carteira").then().statusCode(200)
                .header("ETag", equalTo("\"demo\""))
                .body("acoesFiis.t", hasItem("ITSA4")).body("rendaFixa.size()", equalTo(4));

        // gravações são aceitas e descartadas
        given().header(DEMO, "1").header("If-Match", "\"demo\"").contentType(ContentType.JSON)
                .body("{\"acoesFiis\":[{\"t\":\"PETR4\",\"q\":1}]}")
                .when().put("/api/carteira").then().statusCode(200);
        given().header(DEMO, "1").contentType(ContentType.JSON).body("{\"t\":1}")
                .when().put("/api/historico/2026-10-27").then().statusCode(204);

        // sem o header, a carteira real continua inexistente
        given().when().get("/api/carteira").then().statusCode(404);
        given().when().get("/api/historico").then().statusCode(200).body("size()", equalTo(0));
    }

    @Test
    void importarBackupERecusado() {
        given().header(DEMO, "1").contentType(ContentType.JSON).body("{\"app\":\"painel-acoes\"}")
                .when().post("/api/backup/import").then().statusCode(400);
    }

    @Test
    void mercadoFicticioEstavel() {
        given().header(DEMO, "1").queryParam("symbols", "ITSA4,HGLG11,AAPL,ZZZZ3").queryParam("range", "1y")
                .when().get("/api/data").then().statusCode(200)
                .body("items.size()", equalTo(4))
                .body("items[0].price", equalTo(10.8f))
                .body("items[1].type", equalTo("FII"))
                .body("items[2].currency", equalTo("USD"))
                .body("items[3].points.size()", equalTo(252));
        given().header(DEMO, "1").queryParam("coins", "BTC").when().get("/api/crypto").then()
                .body("prices.BTC.price", equalTo(420000.0f));
        given().header(DEMO, "1").queryParam("days", "30").when().get("/api/fx").then()
                .body("quotes", hasKey("USD")).body("history.USD.size()", equalTo(30));
        given().header(DEMO, "1").queryParam("from", "2025-06-10").when().get("/api/rates").then()
                .body("cdi.size()", greaterThan(200));
        given().header(DEMO, "1").queryParam("type", "cars").when().get("/api/fipe/brands").then()
                .body("data[0].name", equalTo("Montadora Demo"));
    }

    @Test
    void comparativoECustosFicticios() {
        given().header(DEMO, "1").queryParam("range", "6mo").queryParam("crypto", "BTC")
                .when().get("/api/benchmarks").then().statusCode(200)
                .body("indices", hasKey("CDI")).body("crypto", hasKey("BTC"));
        given().header(DEMO, "1").when().get("/api/custos").then().statusCode(200)
                .body("previsaoMes", notNullValue());
        given().header(DEMO, "1").when().get("/api/brapi/uso").then().statusCode(200)
                .body("enabled", equalTo(true)).body("limite", equalTo(15000)).body("usado", equalTo(3120));
    }

    @Test
    void soResponseDemonstracaoComOHeader() {
        given().header(DEMO, "1").when().get("/api/historico").then().header(DEMO, "1").body("size()", greaterThan(50));
        given().when().get("/api/historico").then().header(DEMO, org.hamcrest.Matchers.nullValue()).body("size()", equalTo(0));
    }
}
