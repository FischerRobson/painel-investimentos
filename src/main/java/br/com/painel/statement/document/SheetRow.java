package br.com.painel.statement.document;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public record SheetRow(List<Object> cells) {

    public SheetRow {
        cells = Collections.unmodifiableList(new ArrayList<>(cells));
    }

    public Object get(int column) {
        return column >= 0 && column < cells.size() ? cells.get(column) : null;
    }

    public String text(int column) {
        Object v = get(column);
        return v == null ? null : v.toString().strip();
    }

    public int indexOf(String text) {
        for (int i = 0; i < cells.size(); i++) {
            if (cells.get(i) instanceof String s && s.equalsIgnoreCase(text)) {
                return i;
            }
        }
        return -1;
    }

    public boolean contains(String text) {
        return cells.stream().anyMatch(c -> c instanceof String s && s.contains(text));
    }
}
