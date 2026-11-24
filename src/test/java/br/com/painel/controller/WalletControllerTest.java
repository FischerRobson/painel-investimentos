package br.com.painel.controller;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Comparator;
import java.util.stream.Collectors;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;

// Full flow with the file store (target/test-data).
@QuarkusTest
class WalletControllerTest {

    // The page sends the lists it computed; the server rebuilds the ones of assets with operations
    private static final String OPS = """
            [{"id":"o1","data":"2026-01-05","tipo":"compra","classe":"acao","ativo":"BBDC4","qtd":300,"preco":14,"valor":4200,"valorPresente":0},
             {"id":"o2","data":"2026-01-06","tipo":"compra","classe":"exterior","ativo":"AAPL","qtd":4,"preco":200,"cambio":5.5,"valor":4400,"valorPresente":0},
             {"id":"o3","data":"2026-01-07","tipo":"compra","classe":"cripto","ativo":"BTC","qtd":0.015,"preco":500000,"valor":7500,"valorPresente":0},
             {"id":"o4","data":"2025-06-10","tipo":"aplicacao","classe":"rf","ativo":"a","qtd":10000,"valor":10000,"valorPresente":0,
              "titulo":{"nome":"CDB X","tipo":"CDB","idx":"cdi","taxa":110,"venc":"2027-06-10","isento":false}},
             {"id":"o5","data":"2026-01-08","tipo":"compra","classe":"moeda","ativo":"USD","qtd":300,"cambio":5.4,"valor":1620,"valorPresente":0}]""";

    private static final String WALLET = """
            {"acoesFiis":[{"t":"BBDC4","q":300},{"t":"AAPL","q":4}],
             "cripto":[{"t":"BTC","q":0.015}],
             "rendaFixa":[{"id":"a","nome":"CDB X","tipo":"CDB","idx":"cdi","taxa":110,"aplicado":10000,"data":"2025-06-10","venc":"2027-06-10","isento":false}],
             "moedas":[{"c":"USD","q":300}],
             "bens":[{"id":"car1","type":"cars","brand":"59","model":"5940","year":"2014-3","apelido":"Amarok","hist":{"outubro de 2026":84753}}],
             "preferencias":{"listaPainel":"BBDC4, KNRI11","simulador":{"aporte":1500}},
             "operacoes":%s}""";

    private static String wallet(String ops) {
        return WALLET.formatted(ops);
    }

    private static String ops(String... more) {
        return OPS.substring(0, OPS.lastIndexOf(']')) + Arrays.stream(more).map(o -> "," + o).collect(Collectors.joining()) + "]";
    }

    private static String put(String body, String etag) {
        return given().contentType(ContentType.JSON).header(etag == null ? "If-None-Match" : "If-Match", etag == null ? "*" : "\"" + etag + "\"")
                .body(body).when().put("/api/carteira").then().statusCode(200).extract().path("etag");
    }

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
        given().contentType(ContentType.JSON).body(wallet(OPS)).when().put("/api/carteira").then().statusCode(428);

        String v1 = given().contentType(ContentType.JSON).header("If-None-Match", "*").body(wallet(OPS))
                .when().put("/api/carteira").then().statusCode(200).header("ETag", notNullValue())
                .extract().path("etag");

        given().when().get("/api/carteira").then().statusCode(200)
                .header("ETag", equalTo("\"" + v1 + "\""))
                .body("acoesFiis[0].t", equalTo("BBDC4"))
                .body("bens[0].hist.'outubro de 2026'", equalTo(84753.0f))
                .body("preferencias.simulador.aporte", equalTo(1500));

        String buy = """
                {"id":"o6","data":"2026-02-02","tipo":"compra","classe":"acao","ativo":"BBDC4","qtd":100,"preco":15,"valor":1500,"valorPresente":4500}""";
        String v2 = given().contentType(ContentType.JSON).header("If-Match", "\"" + v1 + "\"")
                .body(wallet(ops(buy)))
                .when().put("/api/carteira").then().statusCode(200).extract().path("etag");

        // another "device" still on version 1 -> 412
        given().contentType(ContentType.JSON).header("If-Match", "\"" + v1 + "\"").body(wallet(ops(buy)))
                .when().put("/api/carteira").then().statusCode(412).body("error", containsString("outro dispositivo"));

        given().when().get("/api/carteira").then().header("ETag", equalTo("\"" + v2 + "\"")).body("acoesFiis[0].q", equalTo(400.0f));
    }

    @Test
    void walletOnlyChangesThroughOperations() {
        String v1 = put(wallet(OPS), null);
        given().when().get("/api/carteira").then().statusCode(200)
                .body("operacoes[0].registrado", notNullValue())
                .body("rendaFixa[0].aplicado", equalTo(10000.0f)).body("rendaFixa[0].nome", equalTo("CDB X"))
                .body("moedas[0].q", equalTo(300.0f));

        // a quantity typed in the list is ignored: it comes from the operations
        String v2 = put(wallet(OPS).replace("\"q\":300}", "\"q\":999}"), v1);
        given().when().get("/api/carteira").then().body("acoesFiis[0].q", equalTo(300.0f)).body("moedas[0].q", equalTo(300.0f));

        // an asset added straight to the list, without an operation, is refused
        given().contentType(ContentType.JSON).header("If-Match", "\"" + v2 + "\"")
                .body(wallet(OPS).replace("{\"t\":\"AAPL\",\"q\":4}", "{\"t\":\"AAPL\",\"q\":4},{\"t\":\"PETR4\",\"q\":10}"))
                .when().put("/api/carteira").then().statusCode(400).body("error", containsString("só muda por operações"));

        // saved operations can't be removed or edited
        given().contentType(ContentType.JSON).header("If-Match", "\"" + v2 + "\"").body(wallet("[]"))
                .when().put("/api/carteira").then().statusCode(400).body("error", containsString("estorno"));
        given().contentType(ContentType.JSON).header("If-Match", "\"" + v2 + "\"").body(wallet(OPS.replace("\"qtd\":300", "\"qtd\":30")))
                .when().put("/api/carteira").then().statusCode(400).body("error", containsString("estorno"));

        // partial redemption takes principal out; reversing the BBDC4 buy takes it out of the wallet
        String resgate = """
                {"id":"o7","data":"2026-03-02","tipo":"resgate","classe":"rf","ativo":"a","qtd":2500,"valor":2900,"valorPresente":11600}""";
        String estorno = """
                {"id":"o8","data":"2026-03-02","tipo":"estorno","classe":"acao","ativo":"BBDC4","estorna":"o1","obs":"lancei na conta errada"}""";
        String v3 = put(wallet(ops(resgate, estorno)), v2);
        given().when().get("/api/carteira").then()
                .body("rendaFixa[0].aplicado", equalTo(7500.0f))
                .body("acoesFiis.t", not(hasItem("BBDC4")))
                .body("operacoes.size()", equalTo(7)).body("operacoes[6].estorna", equalTo("o1"));

        // total redemption: the bond leaves the wallet
        String total = """
                {"id":"o9","data":"2026-04-01","tipo":"resgate","classe":"rf","ativo":"a","qtd":7500,"valor":8800,"valorPresente":8800}""";
        put(wallet(ops(resgate, estorno, total)), v3);
        given().when().get("/api/carteira").then().body("rendaFixa.size()", equalTo(0));
    }

    @Test
    void positionsFromBeforeTheOperationsStayAsTheyWere() {
        given().contentType(ContentType.JSON).body("""
                {"app":"painel-acoes","versao":2,"acoesFiis":[{"t":"KNRI11","q":25}],"cripto":[],"rendaFixa":[],"moedas":[{"c":"EUR","q":50}],"bens":[]}""")
                .when().post("/api/backup/import").then().statusCode(204);
        String v1 = given().when().get("/api/carteira").then().extract().header("ETag").replace("\"", "");
        // other assets can be bought; the old ones stay
        String v2 = put("""
                {"acoesFiis":[{"t":"KNRI11","q":25}],"moedas":[{"c":"EUR","q":50}],
                 "operacoes":[{"id":"x1","data":"2026-01-05","tipo":"compra","classe":"acao","ativo":"ITSA4","qtd":10,"preco":10}]}""", v1);
        given().when().get("/api/carteira").then().body("acoesFiis.t", hasItems("KNRI11", "ITSA4")).body("moedas[0].q", equalTo(50.0f));
        // changing an old one by hand is refused
        given().contentType(ContentType.JSON).header("If-Match", "\"" + v2 + "\"").body("""
                {"acoesFiis":[{"t":"KNRI11","q":30}],"moedas":[{"c":"EUR","q":50}],
                 "operacoes":[{"id":"x1","data":"2026-01-05","tipo":"compra","classe":"acao","ativo":"ITSA4","qtd":10,"preco":10}]}""")
                .when().put("/api/carteira").then().statusCode(400);
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
    void keepsOperationsAndDistributionsInTheWalletAndTheBackup() {
        String wallet = """
                {"acoesFiis":[{"t":"ITSA4","q":60}],
                 "operacoes":[{"id":"o1","data":"2026-01-05","tipo":"compra","classe":"acao","ativo":"ITSA4","qtd":100,"preco":10,"taxas":1.5},
                              {"id":"o2","data":"2026-02-05","tipo":"venda","classe":"acao","ativo":"ITSA4","qtd":40,"preco":12},
                              {"id":"o3","data":"2026-03-05","tipo":"desdobramento","classe":"acao","ativo":"ITSA4","fator":2}],
                 "proventos":[{"id":"p1","data":"2026-04-01","ativo":"ITSA4","tipo":"jcp","valor":8.5,"irRetido":1.5}]}""";
        given().contentType(ContentType.JSON).header("If-None-Match", "*").body(wallet).when().put("/api/carteira").then().statusCode(200);
        given().when().get("/api/carteira").then().statusCode(200)
                .body("operacoes.size()", equalTo(3))
                .body("operacoes[0].taxas", equalTo(1.5f))
                .body("operacoes[2].fator", equalTo(2.0f))
                .body("proventos[0].irRetido", equalTo(1.5f));
        given().when().get("/api/backup").then().statusCode(200)
                .body("operacoes.size()", equalTo(3)).body("proventos[0].tipo", equalTo("jcp"));
    }

    @Test
    void validatesOperations() {
        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body("{\"operacoes\":[{\"id\":\"o\",\"data\":\"2026-01-05\",\"tipo\":\"compra\",\"classe\":\"cripto\",\"ativo\":\"FAKECOIN\",\"qtd\":1,\"preco\":1}]}")
                .when().put("/api/carteira").then().statusCode(400).body("error", containsString("FAKECOIN"));
        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body("{\"operacoes\":[{\"id\":\"o\",\"data\":\"2026-01-05\",\"tipo\":\"aluguel\",\"classe\":\"acao\",\"ativo\":\"ITSA4\",\"qtd\":1,\"preco\":1}]}")
                .when().put("/api/carteira").then().statusCode(400);
        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body("{\"operacoes\":[{\"id\":\"o\",\"data\":\"2026-01-05\",\"tipo\":\"desdobramento\",\"classe\":\"acao\",\"ativo\":\"ITSA4\"}]}")
                .when().put("/api/carteira").then().statusCode(400).body("error", containsString("fator"));
        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body("{\"operacoes\":[{\"id\":\"o\",\"data\":\"2026-01-05\",\"tipo\":\"aplicacao\",\"classe\":\"rf\",\"ativo\":\"t1\",\"qtd\":100}]}")
                .when().put("/api/carteira").then().statusCode(400).body("error", containsString("título"));
        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body("{\"operacoes\":[{\"id\":\"o\",\"data\":\"2026-01-05\",\"tipo\":\"resgate\",\"classe\":\"rf\",\"ativo\":\"t1\",\"qtd\":100}]}")
                .when().put("/api/carteira").then().statusCode(400).body("error", containsString("sem aplicação"));
        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body("{\"operacoes\":[{\"id\":\"o\",\"data\":\"2026-01-05\",\"tipo\":\"compra\",\"classe\":\"moeda\",\"ativo\":\"CHF\",\"qtd\":1}]}")
                .when().put("/api/carteira").then().statusCode(400).body("error", containsString("CHF"));
        given().contentType(ContentType.JSON).header("If-None-Match", "*")
                .body("{\"operacoes\":[{\"id\":\"e\",\"data\":\"2026-01-05\",\"tipo\":\"estorno\",\"classe\":\"acao\",\"ativo\":\"ITSA4\",\"estorna\":\"nada\"}]}")
                .when().put("/api/carteira").then().statusCode(400).body("error", containsString("estorno"));
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
