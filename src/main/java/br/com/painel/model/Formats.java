package br.com.painel.model;

public final class Formats {
    public static final String ISO_DATE = "\\d{4}-\\d{2}-\\d{2}";
    public static final String YEAR_MONTH = "\\d{4}-(0[1-9]|1[0-2])";
    public static final String ENTRY_ID = "[A-Za-z0-9-]{1,40}";
    public static final String IMPORT_KEY = "[a-f0-9]{24}";
    public static final String INSTALLMENT = "\\d{1,3}/\\d{1,3}";
    static final String FIPE_MONTH = "[a-zç]+ de \\d{4}";

    private Formats() {
    }
}
