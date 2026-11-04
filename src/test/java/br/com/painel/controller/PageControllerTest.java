package br.com.painel.controller;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThan;

// Tests that need no network (external sources are not called).
@QuarkusTest
class PageControllerTest {

    @Test
    void pagesServeTheIndex() {
        for (String p : new String[]{"/", "/carteira", "/projecao", "/ativos", "/moedas", "/bens", "/custos", "/glossario"}) {
            given().when().get(p).then().statusCode(200).body(containsString("Meus Investimentos"));
        }
    }

    @Test
    void glossaryIsPublicAndValid() {
        given().when().get("/glossario.json").then().statusCode(200)
                .body("termos.size()", greaterThan(50))
                .body("categorias.size()", greaterThan(0));
    }

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
    void dataWithoutTickersCallsNothing() {
        given().when().get("/api/data").then().statusCode(200)
                .body("range", equalTo("1y")).body("items.size()", equalTo(0));
    }
}
