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
import static org.hamcrest.Matchers.anyOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

@QuarkusTest
class BudgetControllerTest {

    private static final String SETTINGS = """
            {"targets":{"fixedCosts":40,"comfort":15,"pleasures":10,"education":5,"financialFreedom":30}}""";

    private static final String MONTH = """
            {"incomes":[{"id":"i1","date":"2026-11-05","description":"Salário","amount":10000}],
             "expenses":[{"id":"e1","date":"2026-10-28","description":"Aluguel","amount":2500,"area":"fixedCosts"},
                         {"id":"e2","date":"2026-11-02","description":"IFOOD","amount":80.5,"area":"pleasures"},
                         {"id":"e3","date":"2026-11-03","description":"Restaurante","amount":119.5,"area":"pleasures"}]}""";

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
    void settingsStartWithDefaultsAndMustSumToOneHundred() {
        given().when().get("/api/budget/settings").then().statusCode(200)
                .header("ETag", nullValue())
                .body("targets.fixedCosts", equalTo(50.0f))
                .body("targets.financialFreedom", equalTo(25.0f));

        given().contentType(ContentType.JSON).body(SETTINGS).when().put("/api/budget/settings").then().statusCode(428);

        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body(SETTINGS.replace("\"comfort\":15", "\"comfort\":20"))
                .when().put("/api/budget/settings").then().statusCode(400).body("error", containsString("somar 100%"));

        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body("{\"targets\":{\"fixedCosts\":100}}")
                .when().put("/api/budget/settings").then().statusCode(400).body("error", containsString("todas as áreas"));

        String etag = given().contentType(ContentType.JSON).header("If-None-Match", "*").body(SETTINGS)
                .when().put("/api/budget/settings").then().statusCode(200).extract().path("etag");

        given().when().get("/api/budget/settings").then().statusCode(200)
                .header("ETag", equalTo("\"" + etag + "\""))
                .body("targets.comfort", equalTo(15.0f));
    }

    @Test
    void monthsAreSavedWithOptimisticLocking() {
        given().when().get("/api/budget/months/2026-11").then().statusCode(200)
                .header("ETag", nullValue())
                .body("incomes.size()", equalTo(0)).body("expenses.size()", equalTo(0));

        String v1 = given().contentType(ContentType.JSON).header("If-None-Match", "*").body(MONTH)
                .when().put("/api/budget/months/2026-11").then().statusCode(200).header("ETag", notNullValue())
                .extract().path("etag");

        given().when().get("/api/budget/months/2026-11").then().statusCode(200)
                .header("ETag", equalTo("\"" + v1 + "\""))
                .body("expenses[0].area", equalTo("fixedCosts"))
                .body("expenses[0].date", equalTo("2026-10-28"));

        given().contentType(ContentType.JSON).header("If-Match", "\"" + v1 + "\"")
                .body(MONTH.replace("\"amount\":2500", "\"amount\":2600"))
                .when().put("/api/budget/months/2026-11").then().statusCode(200);

        given().contentType(ContentType.JSON).header("If-Match", "\"" + v1 + "\"").body(MONTH)
                .when().put("/api/budget/months/2026-11").then().statusCode(412);
    }

    @Test
    void rejectsInvalidMonths() {
        given().when().get("/api/budget/months/2026-13").then().statusCode(400);
        given().when().get("/api/budget/months/..%2F..%2Fcarteira").then().statusCode(anyOf(equalTo(400), equalTo(404)));

        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body(MONTH.replace("\"area\":\"pleasures\"", "\"area\":\"financialFreedom\""))
                .when().put("/api/budget/months/2026-11").then().statusCode(400).body("error", containsString("aportes da Carteira"));

        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body(MONTH.replace("\"id\":\"e2\"", "\"id\":\"e1\""))
                .when().put("/api/budget/months/2026-11").then().statusCode(400).body("error", containsString("repetido"));

        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body(MONTH.replace("2026-11-02", "2026-02-30"))
                .when().put("/api/budget/months/2026-11").then().statusCode(400).body("error", containsString("data inválida"));

        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body(MONTH.replace("\"amount\":80.5", "\"amount\":-3"))
                .when().put("/api/budget/months/2026-11").then().statusCode(400);
    }

    @Test
    void summarizesMonthsByArea() {
        given().contentType(ContentType.JSON).header("If-None-Match", "*").body(MONTH)
                .when().put("/api/budget/months/2026-11").then().statusCode(200);

        given().queryParam("to", "2026-11").queryParam("months", 3).when().get("/api/budget/summary").then().statusCode(200)
                .body("size()", equalTo(3))
                .body("[0].month", equalTo("2026-09"))
                .body("[0].expenses", equalTo(0.0f))
                .body("[2].month", equalTo("2026-11"))
                .body("[2].income", equalTo(10000.0f))
                .body("[2].expenses", equalTo(2700.0f))
                .body("[2].areas.pleasures", equalTo(200.0f))
                .body("[2].areas.education", equalTo(0.0f));
    }

    @Test
    void backupCarriesTheBudget() throws IOException {
        given().contentType(ContentType.JSON).header("If-None-Match", "*").body(SETTINGS)
                .when().put("/api/budget/settings").then().statusCode(200);
        given().contentType(ContentType.JSON).header("If-None-Match", "*").body(MONTH)
                .when().put("/api/budget/months/2026-11").then().statusCode(200);

        String backup = given().when().get("/api/backup").then().statusCode(200)
                .body("budget.settings.targets.comfort", equalTo(15.0f))
                .body("budget.months", hasKey("2026-11"))
                .extract().asString();

        clean();
        given().when().get("/api/budget/months/2026-11").then().body("expenses.size()", equalTo(0));

        given().contentType(ContentType.JSON).body(backup).when().post("/api/backup/import").then().statusCode(204);
        given().when().get("/api/budget/months/2026-11").then().statusCode(200).body("expenses.size()", equalTo(3));
        given().when().get("/api/budget/settings").then().body("targets.financialFreedom", equalTo(30.0f));
    }

    @Test
    void demoModeAnswersWithFakeData() {
        given().header("X-Painel-Demo", "1").when().get("/api/budget/months/2026-11").then().statusCode(200)
                .body("incomes[0].description", equalTo("Salário"));
        given().header("X-Painel-Demo", "1").queryParam("to", "2026-11").when().get("/api/budget/summary").then().statusCode(200)
                .body("size()", equalTo(12));
        given().header("X-Painel-Demo", "1").contentType(ContentType.JSON).body(MONTH)
                .when().put("/api/budget/months/2026-11").then().statusCode(200);
        given().when().get("/api/budget/months/2026-11").then().body("expenses.size()", equalTo(0));
    }
}
