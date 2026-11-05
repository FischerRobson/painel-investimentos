package br.com.painel.controller;

import br.com.painel.statement.SampleStatements;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
class BudgetImportControllerTest {

    @BeforeEach
    void clean() throws IOException {
        Path dir = Path.of("target/test-data");
        if (Files.exists(dir)) {
            try (var files = Files.walk(dir)) {
                files.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
            }
        }
    }

    private static JsonPath preview(String name, byte[] content) {
        return given().contentType("application/octet-stream").queryParam("name", name).body(content)
                .when().post("/api/budget/import/preview").then().statusCode(200).extract().jsonPath();
    }

    private static JsonPath commit(List<Map<String, Object>> items, boolean future) {
        return given().contentType(ContentType.JSON).body(Map.of("items", items, "includeFutureInstallments", future))
                .when().post("/api/budget/import/commit").then().statusCode(200).extract().jsonPath();
    }

    private static Map<String, Object> item(JsonPath p, String description) {
        return p.<Map<String, Object>>getList("items").stream()
                .filter(i -> description.equals(i.get("description"))).findFirst().orElseThrow();
    }

    @Test
    void accountStatementIsReviewedThenImportedOnce() {
        JsonPath p = preview("extrato.xlsx", SampleStatements.accountXlsx());
        assertEquals("checkingAccount", p.getString("kind"));
        assertEquals(6, p.getList("items").size());

        Map<String, Object> padaria = item(p, "Padaria Do Bairro");
        assertEquals("pix", padaria.get("method"));
        assertEquals("expense", padaria.get("type"));
        assertEquals(35.5f, padaria.get("amount"));
        assertEquals("2026-10", padaria.get("month"));
        assertEquals(true, padaria.get("selected"));

        assertEquals("pleasures", item(p, "Restaurante Bom").get("area"));
        assertEquals("fixedCosts", item(p, "Internet Fibra").get("area"));
        assertEquals("income", item(p, "Empresa Ltda").get("type"));

        Map<String, Object> bill = item(p, "Fatura do cartão BTG Pactual");
        assertEquals(false, bill.get("selected"));
        assertTrue(((String) bill.get("note")).contains("fatura"));
        Map<String, Object> own = item(p, SampleStatements.HOLDER);
        assertEquals(false, own.get("selected"));

        Map<String, Object> restaurant = new HashMap<>(item(p, "Restaurante Bom"));
        restaurant.put("area", "comfort");
        List<Map<String, Object>> chosen = List.of(padaria, restaurant, item(p, "Empresa Ltda"), item(p, "Internet Fibra"));
        JsonPath result = commit(chosen, true);
        assertEquals(4, result.getInt("imported"));
        assertEquals(List.of("2026-10"), result.getList("months"));

        given().when().get("/api/budget/months/2026-10").then().statusCode(200)
                .body("incomes.size()", equalTo(1))
                .body("expenses.size()", equalTo(3))
                .body("expenses.find { it.description == 'Padaria Do Bairro' }.method", equalTo("pix"))
                .body("expenses.find { it.description == 'Restaurante Bom' }.area", equalTo("comfort"));

        JsonPath again = preview("extrato.pdf", SampleStatements.accountPdf());
        Map<String, Object> padariaAgain = item(again, "Padaria Do Bairro");
        assertEquals(true, padariaAgain.get("duplicate"));
        assertEquals(false, padariaAgain.get("selected"));

        JsonPath fromSheetAgain = preview("extrato.xls", SampleStatements.accountXls());
        assertEquals("comfort", item(fromSheetAgain, "Restaurante Bom").get("area"));
        assertEquals(0, commit(List.of(padaria), false).getInt("imported"));
    }

    @Test
    void cardInstallmentsAreProjectedAndNotDuplicatedNextMonth() {
        JsonPath oct = preview("fatura.pdf", SampleStatements.cardPdf("Outubro", "05 Set Havan (2/4) R$ 399,99", "23 Set Uber R$ 5,40"));
        assertEquals("creditCard", oct.getString("kind"));
        assertEquals("2026-10", oct.getString("billingMonth"));
        Map<String, Object> havan = item(oct, "Havan");
        assertEquals("creditCard", havan.get("method"));
        assertEquals("2/4", havan.get("installment"));
        assertEquals("2026-09-05", havan.get("date"));
        assertEquals("2026-10", havan.get("month"));
        assertEquals(2, ((List<?>) havan.get("future")).size());
        assertEquals("creditPix", item(oct, "Pix no cartão de crédito").get("method"));

        JsonPath result = commit(List.of(havan, item(oct, "Uber")), true);
        assertEquals(4, result.getInt("imported"));
        assertEquals(List.of("2026-10", "2026-11", "2026-12"), result.getList("months"));

        given().when().get("/api/budget/months/2026-12").then().statusCode(200)
                .body("expenses[0].installment", equalTo("4/4"))
                .body("expenses[0].date", equalTo("2026-09-05"));

        JsonPath nov = preview("fatura.pdf", SampleStatements.cardPdf("Novembro", "05 Set Havan (3/4) R$ 399,99"));
        Map<String, Object> next = item(nov, "Havan");
        assertEquals(true, next.get("duplicate"));
        assertFalse((Boolean) next.get("selected"));
    }

    @Test
    void descriptionRulesRenameAndSetAreaOnImport() {
        given().when().get("/api/budget/rules").then().statusCode(200).body("rules.size()", equalTo(0));

        String rules = """
                {"rules":[{"id":"r1","match":"padaria","description":"Café da manhã","area":"pleasures"},
                          {"id":"r2","match":"INTERNET","description":"Internet de casa"}]}""";
        given().contentType(ContentType.JSON).header("If-None-Match", "*").body(rules)
                .when().put("/api/budget/rules").then().statusCode(200);

        JsonPath p = preview("extrato.xlsx", SampleStatements.accountXlsx());
        Map<String, Object> breakfast = item(p, "Café da manhã");
        assertEquals("Padaria Do Bairro", breakfast.get("originalDescription"));
        assertEquals("pleasures", breakfast.get("area"));
        Map<String, Object> internet = item(p, "Internet de casa");
        assertEquals("Internet Fibra", internet.get("originalDescription"));
        assertEquals("fixedCosts", internet.get("area"));

        commit(List.of(breakfast), false);
        assertEquals(true, item(preview("extrato.pdf", SampleStatements.accountPdf()), "Café da manhã").get("duplicate"));

        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body("{\"rules\":[{\"id\":\"a\",\"match\":\"ab\",\"description\":\"X\"}]}")
                .when().put("/api/budget/rules").then().statusCode(400).body("error", containsString("3 letras"));
    }

    @Test
    void rejectsUnreadableFilesAndManualAreaForFinancialFreedom() {
        given().contentType("application/octet-stream").body("nada".getBytes())
                .when().post("/api/budget/import/preview").then().statusCode(400)
                .body("error", containsString("PDF, XLS ou XLSX"));

        Map<String, Object> bad = Map.of("key", "0123456789abcdef01234567", "month", "2026-10", "type", "expense",
                "date", "2026-10-01", "description", "X", "amount", 10, "area", "financialFreedom");
        given().contentType(ContentType.JSON).body(Map.of("items", List.of(bad)))
                .when().post("/api/budget/import/commit").then().statusCode(400)
                .body("error", containsString("Liberdade financeira"));
    }
}
