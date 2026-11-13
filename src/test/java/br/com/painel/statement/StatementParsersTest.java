package br.com.painel.statement;

import br.com.painel.model.PaymentMethod;
import br.com.painel.service.InvalidDataException;
import br.com.painel.statement.ParsedStatement.StatementKind;
import br.com.painel.statement.document.StatementFile;
import br.com.painel.statement.parser.BtgAccountPdfParser;
import br.com.painel.statement.parser.BtgAccountSheetParser;
import br.com.painel.statement.parser.BtgCardStatementParser;
import br.com.painel.statement.parser.NubankCardStatementParser;
import br.com.painel.statement.parser.StatementParsers;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StatementParsersTest {

    private final StatementParsers parsers = new StatementParsers(
            List.of(new BtgAccountSheetParser(), new BtgAccountPdfParser(), new BtgCardStatementParser(),
                    new NubankCardStatementParser()));

    @Test
    void readsXlsxAndXlsTheSameWay() {
        ParsedStatement xlsx = parsers.parse(new StatementFile("e.xlsx", SampleStatements.accountXlsx()));
        ParsedStatement xls = parsers.parse(new StatementFile("e.xls", SampleStatements.accountXls()));

        assertEquals(xlsx.entries(), xls.entries());
        assertEquals(StatementKind.CHECKING_ACCOUNT, xlsx.kind());
        assertEquals(SampleStatements.HOLDER, xlsx.holder());
        assertEquals(6, xlsx.entries().size());

        StatementEntry pix = xlsx.entries().getFirst();
        assertEquals(LocalDate.of(2026, 10, 1), pix.date());
        assertEquals(LocalTime.of(17, 25), pix.time());
        assertEquals("Padaria Do Bairro", pix.description());
        assertEquals(-35.5, pix.amount());
        assertEquals(PaymentMethod.PIX, pix.method());

        assertEquals(PaymentMethod.DEBIT_CARD, xlsx.entries().get(1).method());
        assertEquals(5000.0, xlsx.entries().get(2).amount());
        StatementEntry bill = xlsx.entries().get(4);
        assertTrue(bill.cardBillPayment());
        assertEquals(PaymentMethod.BILL, bill.method());
    }

    @Test
    void readsAccountPdfWithWrappedCells() {
        ParsedStatement st = parsers.parse(new StatementFile("e.pdf", SampleStatements.accountPdf()));

        assertEquals(SampleStatements.HOLDER, st.holder());
        assertEquals(5, st.entries().size());
        StatementEntry cinema = st.entries().get(1);
        assertEquals("Cinema Central", cinema.description());
        assertEquals("Lazer e Entretenimento", cinema.category());
        assertEquals(-42.0, cinema.amount());

        StatementEntry bill = st.entries().get(2);
        assertTrue(bill.cardBillPayment());
        assertEquals(-1200.0, bill.amount());

        StatementEntry online = st.entries().get(3);
        assertEquals("Outra Categoria", online.category());
        assertEquals(PaymentMethod.PIX, online.method());

        StatementEntry salary = st.entries().get(4);
        assertEquals(5000.0, salary.amount());
        assertEquals(PaymentMethod.TRANSFER, salary.method());
    }

    @Test
    void readsCardStatementInTwoColumnsWithInstallments() {
        ParsedStatement st = parsers.parse(new StatementFile("f.pdf", SampleStatements.cardPdf("Outubro",
                "16 Jul Loja A (3/3) R$ 425,76", "23 Set Uber R$ 5,40",
                "05 Set Havan (2/10) R$ 399,99", "01 Out Seguro Casa 03 De 10 R$ 263,23",
                "10 Out Estorno Loja -R$ 20,00")));

        assertEquals(StatementKind.CREDIT_CARD, st.kind());
        assertEquals(YearMonth.of(2026, 10), st.billingMonth());
        assertEquals(6, st.entries().size());

        StatementEntry loja = st.entries().getFirst();
        assertEquals(LocalDate.of(2026, 7, 16), loja.date());
        assertEquals("Loja A", loja.description());
        assertEquals("3/3", loja.installment().toString());
        assertEquals(-425.76, loja.amount());
        assertEquals(PaymentMethod.CREDIT_CARD, loja.method());

        assertEquals("Uber", st.entries().get(1).description());
        assertEquals("2/10", st.entries().get(2).installment().toString());
        StatementEntry insurance = st.entries().get(3);
        assertEquals("Seguro Casa 03 De 10", insurance.description());
        assertNull(insurance.installment());
        assertEquals(LocalDate.of(2026, 10, 1), insurance.date());
        assertEquals(20.0, st.entries().get(4).amount());

        StatementEntry pix = st.entries().get(5);
        assertEquals(PaymentMethod.CREDIT_PIX, pix.method());
        assertEquals(-51.69, pix.amount());
    }

    @Test
    void cardPurchasesFromDecemberBelongToThePreviousYear() {
        ParsedStatement st = parsers.parse(new StatementFile("f.pdf", SampleStatements.cardPdf("Janeiro",
                "20 Dez Mercado R$ 100,00", "02 Jan Padaria R$ 10,00")));

        assertEquals(LocalDate.of(2025, 12, 20), st.entries().get(0).date());
        assertEquals(LocalDate.of(2026, 1, 2), st.entries().get(1).date());
    }

    @Test
    void readsNubankCardStatement() {
        ParsedStatement st = parsers.parse(new StatementFile("Nubank_2026-11-18.pdf", SampleStatements.nubankCardPdf()));

        assertEquals(StatementKind.CREDIT_CARD, st.kind());
        assertEquals("Fatura do cartão Nubank", st.source());
        assertEquals("MARIA TESTE SILVA", st.holder());
        assertEquals(YearMonth.of(2026, 11), st.billingMonth());
        assertEquals(5, st.entries().size());

        StatementEntry school = st.entries().getFirst();
        assertEquals(LocalDate.of(2026, 10, 11), school.date());
        assertEquals("Mp *Escola", school.description());
        assertEquals("7/12", school.installment().toString());
        assertEquals(-199.75, school.amount());
        assertEquals(PaymentMethod.CREDIT_CARD, school.method());

        StatementEntry refund = st.entries().get(1);
        assertEquals("Estorno de \"Loja\"", refund.description());
        assertEquals(182.58, refund.amount());

        StatementEntry purchase = st.entries().get(2);
        assertEquals("Loja", purchase.description());
        assertEquals("1/3", purchase.installment().toString());
        assertEquals(-182.58, purchase.amount());

        assertEquals("Streaming", st.entries().get(3).description());

        StatementEntry pix = st.entries().get(4);
        assertEquals(LocalDate.of(2026, 10, 18), pix.date());
        assertEquals("Fulano De Tal", pix.description());
        assertEquals(-52.76, pix.amount());
        assertEquals(PaymentMethod.CREDIT_PIX, pix.method());
        assertTrue(st.entries().stream().noneMatch(e -> e.description().startsWith("Pagamento em")));
    }

    @Test
    void rejectsUnknownFiles() {
        var e = assertThrows(InvalidDataException.class,
                () -> parsers.parse(new StatementFile("a.txt", "oi".getBytes(StandardCharsets.UTF_8))));
        assertTrue(e.getMessage().contains("PDF, XLS ou XLSX"));
    }
}
