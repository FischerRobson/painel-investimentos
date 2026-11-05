package br.com.painel.statement.document;

import br.com.painel.service.InvalidDataException;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public record SheetRows(List<SheetRow> rows) {

    public SheetRows {
        rows = List.copyOf(rows);
    }

    public static SheetRows read(byte[] content) {
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(content))) {
            List<SheetRow> rows = new ArrayList<>();
            for (Sheet sheet : wb) {
                for (Row row : sheet) {
                    List<Object> cells = new ArrayList<>();
                    for (int c = 0; c < Math.max(0, row.getLastCellNum()); c++) {
                        cells.add(value(row.getCell(c)));
                    }
                    rows.add(new SheetRow(cells));
                }
            }
            return new SheetRows(rows);
        } catch (IOException | RuntimeException e) {
            throw new InvalidDataException("não foi possível ler a planilha");
        }
    }

    public boolean contains(String text) {
        return rows.stream().anyMatch(r -> r.contains(text));
    }

    private static Object value(Cell cell) {
        if (cell == null) {
            return null;
        }
        CellType type = cell.getCellType() == CellType.FORMULA ? cell.getCachedFormulaResultType() : cell.getCellType();
        return switch (type) {
            case NUMERIC -> DateUtil.isCellDateFormatted(cell) ? cell.getLocalDateTimeCellValue() : cell.getNumericCellValue();
            case STRING -> cell.getStringCellValue().isBlank() ? null : cell.getStringCellValue().strip();
            case BOOLEAN -> cell.getBooleanCellValue();
            default -> null;
        };
    }
}
