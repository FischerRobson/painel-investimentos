package br.com.painel.controller;

import io.quarkus.test.junit.QuarkusTest;
import org.eclipse.microprofile.config.ConfigProvider;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.matchesPattern;

@QuarkusTest
class VersionControllerTest {

    private static final String VERSAO = ConfigProvider.getConfig().getValue("quarkus.application.version", String.class);

    @Test
    void devolveAVersaoDoPom() {
        given().when().get("/api/version")
                .then().statusCode(200)
                .body("version", equalTo(VERSAO))
                .body("version", matchesPattern("\\d+\\.\\d+\\.\\d+"));
    }

    @Test
    void modoDemonstracaoMostraAVersaoReal() {
        given().header("X-Painel-Demo", "1").when().get("/api/version")
                .then().statusCode(200).body("version", equalTo(VERSAO));
    }
}
