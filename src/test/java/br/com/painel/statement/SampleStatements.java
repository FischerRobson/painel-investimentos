package br.com.painel.statement;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;

public final class SampleStatements {

    public static final String HOLDER = "Maria Teste Silva";

    private SampleStatements() {
    }

    public static byte[] accountXlsx() {
        return accountSheet(new XSSFWorkbook());
    }

    public static byte[] accountXls() {
        return accountSheet(new HSSFWorkbook());
    }

    private static byte[] accountSheet(Workbook wb) {
        Sheet sheet = wb.createSheet("Extrato");
        int[] r = {0};
        row(sheet, r, 1, "Extrato de conta corrente");
        row(sheet, r, 1, "Cliente:", HOLDER);
        row(sheet, r, 1, "Período do extrato:", "01/10/2026 a 31/10/2026");
        Row header = sheet.createRow(r[0]++);
        set(header, 1, "Data e hora");
        set(header, 2, "Categoria");
        set(header, 3, "Transação");
        set(header, 6, "Descrição");
        set(header, 10, "Valor");
        movement(sheet, r, "01/10/2026 17:25", "Transferência", "Pix enviado", "Padaria Do Bairro", -35.5);
        movement(sheet, r, "01/10/2026 23:59", null, null, "Saldo Diário", 964.5);
        movement(sheet, r, "02/10/2026 20:37", "Alimentação", "Compra no débito autorizada", "Restaurante Bom", -80.0);
        movement(sheet, r, "05/10/2026 00:02", "Salário", "Pagamento de salário", "Empresa Ltda", 5000.0);
        movement(sheet, r, "05/10/2026 11:03", "Investimentos", "Transferência recebida", HOLDER, 300.0);
        movement(sheet, r, "15/10/2026 11:04", "Contas", "Pagamento de fatura do cartão", "Fatura do cartão BTG Pactual", -1200.0);
        movement(sheet, r, "15/10/2026 12:00", "Contas", "Pix enviado", "Internet Fibra", -99.9);
        try (wb; var out = new ByteArrayOutputStream()) {
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void movement(Sheet sheet, int[] r, String when, String category, String tx, String desc, double value) {
        Row row = sheet.createRow(r[0]++);
        set(row, 1, when);
        set(row, 2, category);
        set(row, 3, tx);
        set(row, 6, desc);
        row.createCell(10).setCellValue(value);
    }

    private static void row(Sheet sheet, int[] r, int col, String... values) {
        Row row = sheet.createRow(r[0]++);
        for (int i = 0; i < values.length; i++) {
            set(row, col + i, values[i]);
        }
    }

    private static void set(Row row, int col, String value) {
        if (value != null) {
            row.createCell(col).setCellValue(value);
        }
    }

    public static byte[] accountPdf() {
        List<Text> t = new ArrayList<>();
        t.add(new Text(25, 84, "Extrato de conta corrente"));
        t.add(new Text(43, 111, "Cliente:"));
        t.add(new Text(142, 111, HOLDER));
        t.add(new Text(47, 230, "Data e hora"));
        t.add(new Text(123, 230, "Categoria"));
        t.add(new Text(216, 230, "Transação"));
        t.add(new Text(377, 230, "Descrição"));
        t.add(new Text(513, 230, "Valor"));
        accountRow(t, 253, "01/10/2026 17h25", "Transferência", "Pix enviado", "Padaria Do Bairro", "-R$ 35,50");
        accountRow(t, 268, "01/10/2026 23h59", null, null, "Saldo Diário", "R$ 964,50");
        t.add(new Text(110, 279, "Lazer e"));
        accountRow(t, 288, "02/10/2026 20h37", "Entretenimento", "Pix enviado", "Cinema Central", "-R$ 42,00");
        t.add(new Text(175, 304, "Pagamento de fatura do cartão"));
        accountRow(t, 309, "15/10/2026 11h04", "Contas", null, "Fatura do cartão BTG Pactual", "-R$ 1.200,00");
        t.add(new Text(110, 320, "Outra Categoria"));
        accountRow(t, 325, "15/10/2026 12h00", null, "Pix enviado", "Loja Online", "-R$ 15,00");
        accountRow(t, 340, "16/10/2026 09h00", "Salário", "Pagamento de salário", "Empresa Ltda", "R$ 5.000,00");
        t.add(new Text(300, 745, "Ouvidoria: 0800"));
        return pdf(List.of(t));
    }

    private static void accountRow(List<Text> t, double y, String when, String cat, String tx, String desc, String value) {
        t.add(new Text(30, y, when));
        if (cat != null) {
            t.add(new Text(110, y, cat));
        }
        if (tx != null) {
            t.add(new Text(175, y, tx));
        }
        t.add(new Text(300, y, desc));
        t.add(new Text(515, y, value));
    }

    public static byte[] cardPdf(String month, String... items) {
        List<Text> page1 = new ArrayList<>();
        page1.add(new Text(30, 30, HOLDER + " | fatura de " + month + " de 2026 | cartão final 1234"));
        page1.add(new Text(30, 60, "Pagamentos feitos pelo cliente -R$ 900,00"));
        page1.add(new Text(30, 75, "15 Set Pagamento de fatura - R$ 900,00"));
        page1.add(new Text(30, 90, "Lançamentos do cartão físico | Maria | Final 1234 Total do cartão: R$ 1,00"));
        page1.add(new Text(30, 105, "Total de compras e despesas R$ 1,00"));
        double y = 120;
        for (int i = 0; i < items.length; i += 2) {
            page1.add(new Text(30, y, items[i]));
            if (i + 1 < items.length) {
                page1.add(new Text(300, y, items[i + 1]));
            }
            y += 15;
        }
        page1.add(new Text(30, y + 10, "Outros Lançamentos Total de outros lançamentos: R$ 51,69"));
        page1.add(new Text(30, y + 25, "26 Set Pix no cartão de crédito R$ 51,69"));
        page1.add(new Text(30, y + 40, "BTG Pactual S.A"));
        List<Text> page2 = List.of(new Text(30, 30, "Taxas e encargos"), new Text(30, 45, "01 Out Juros R$ 9,99"));
        return pdf(List.of(page1, page2));
    }

    private record Text(double x, double y, String text) {
    }

    private static byte[] pdf(List<List<Text>> pages) {
        try (PDDocument doc = new PDDocument(); var out = new ByteArrayOutputStream()) {
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            for (List<Text> texts : pages) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);
                float height = page.getMediaBox().getHeight();
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    for (Text t : texts) {
                        cs.beginText();
                        cs.setFont(font, 7.5f);
                        cs.newLineAtOffset((float) t.x(), height - (float) t.y());
                        cs.showText(t.text());
                        cs.endText();
                    }
                }
            }
            doc.save(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
