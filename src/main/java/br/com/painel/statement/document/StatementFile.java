package br.com.painel.statement.document;

import java.util.Arrays;

public final class StatementFile {

    private static final byte[] PDF_MAGIC = {'%', 'P', 'D', 'F'};
    private static final byte[] ZIP_MAGIC = {'P', 'K', 3, 4};
    private static final byte[] OLE_MAGIC = {(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0};

    private final String name;
    private final byte[] content;
    private PdfText pdf;
    private SheetRows sheet;

    public StatementFile(String name, byte[] content) {
        this.name = name == null ? "" : name;
        this.content = content;
    }

    public String name() {
        return name;
    }

    public boolean isPdf() {
        return startsWith(PDF_MAGIC);
    }

    public boolean isSpreadsheet() {
        return startsWith(ZIP_MAGIC) || startsWith(OLE_MAGIC);
    }

    public synchronized PdfText pdf() {
        if (pdf == null) {
            pdf = PdfText.read(content);
        }
        return pdf;
    }

    public synchronized SheetRows sheet() {
        if (sheet == null) {
            sheet = SheetRows.read(content);
        }
        return sheet;
    }

    private boolean startsWith(byte[] magic) {
        return content.length >= magic.length && Arrays.equals(content, 0, magic.length, magic, 0, magic.length);
    }
}
