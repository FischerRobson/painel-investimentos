package br.com.painel.controller;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

// Tests that need no network (external sources are not called). The pages and glossario.json come from the React build
// (src/main/webui), which is off in tests: they are covered by the e2e tests and .github/scripts/check-frontend.mjs.
@QuarkusTest
class PublicEndpointsTest {

    @Test
    void doesNotExposeOtherFiles() {
        given().when().get("/.env").then().statusCode(404);
        given().when().get("/application.properties").then().statusCode(404);
        given().when().get("/qualquer-coisa").then().statusCode(404);
    }

    @Test
    void fipeRejectsMaliciousParameters() {
        given().queryParam("type", "cars").queryParam("brand", "../../x")
                .when().get("/api/fipe/models")
                .then().statusCode(200).body("error", equalTo("parâmetros inválidos"));
        given().queryParam("type", "aviao").when().get("/api/fipe/brands")
                .then().statusCode(200).body("error", equalTo("parâmetros inválidos"));
    }

    @Test
    void ratesValidatesTheDate() {
        given().queryParam("from", "ontem").when().get("/api/rates")
                .then().statusCode(200).body("error", equalTo("data inválida"));
    }

    @Test
    void positionsValidateTheDate() {
        given().when().get("/api/positions/ontem").then().statusCode(400).body("error", equalTo("data inválida"));
        given().when().get("/api/positions/2001-01-02").then().statusCode(404).body("error", equalTo("sem posições salvas neste dia"));
        given().when().get("/api/positions").then().statusCode(200);
    }

    @Test
    void dataWithoutTickersCallsNothing() {
        given().when().get("/api/data").then().statusCode(200)
                .body("range", equalTo("1y")).body("items.size()", equalTo(0));
    }
}
