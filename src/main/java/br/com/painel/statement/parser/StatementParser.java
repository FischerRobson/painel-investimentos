package br.com.painel.statement.parser;

import br.com.painel.statement.ParsedStatement;
import br.com.painel.statement.document.StatementFile;

public interface StatementParser {

    String name();

    boolean supports(StatementFile file);

    ParsedStatement parse(StatementFile file);
}
