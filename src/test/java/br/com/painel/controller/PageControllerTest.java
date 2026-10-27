package br.com.painel.controller;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;

/** Testes que não dependem de rede (as fontes externas não são chamadas). */
@QuarkusTest
class PageControllerTest {

    @Test
    void paginasServemOIndex() {
        for (String p : new String[]{"/", "/carteira", "/projecao", "/ativos", "/moedas", "/bens", "/custos"}) {
            given().when().get(p).then().statusCode(200).body(containsString("Meus Investimentos"));
        }
    }

    @Test
    void naoExpoeOutrosArquivos() {
        given().when().get("/.env").then().statusCode(404);
        given().when().get("/application.properties").then().statusCode(404);
        given().when().get("/qualquer-coisa").then().statusCode(404);
    }

    @Test
    void fipeRejeitaParametrosMaliciosos() {
        given().queryParam("type", "cars").queryParam("brand", "../../x")
                .when().get("/api/fipe/models")
                .then().statusCode(200).body("error", equalTo("parâmetros inválidos"));
        given().queryParam("type", "aviao").when().get("/api/fipe/brands")
                .then().statusCode(200).body("error", equalTo("parâmetros inválidos"));
    }

    @Test
    void ratesValidaData() {
        given().queryParam("from", "ontem").when().get("/api/rates")
                .then().statusCode(200).body("error", equalTo("data inválida"));
    }

    @Test
    void dataSemTickersNaoChamaNada() {
        given().when().get("/api/data").then().statusCode(200)
                .body("range", equalTo("1y")).body("items.size()", equalTo(0));
    }
}
