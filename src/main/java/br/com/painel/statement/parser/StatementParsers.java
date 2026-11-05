package br.com.painel.statement.parser;

import br.com.painel.service.InvalidDataException;
import br.com.painel.statement.ParsedStatement;
import br.com.painel.statement.document.StatementFile;
import io.quarkus.arc.All;
import jakarta.enterprise.context.ApplicationScoped;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

@ApplicationScoped
public class StatementParsers {

    private static final Logger LOG = LoggerFactory.getLogger(StatementParsers.class);

    private final List<StatementParser> parsers;

    public StatementParsers(@All List<StatementParser> parsers) {
        this.parsers = List.copyOf(parsers);
    }

    public ParsedStatement parse(StatementFile file) {
        if (!file.isPdf() && !file.isSpreadsheet()) {
            throw new InvalidDataException("envie o extrato ou a fatura em PDF, XLS ou XLSX");
        }
        StatementParser parser = parsers.stream().filter(p -> p.supports(file)).findFirst()
                .orElseThrow(() -> new InvalidDataException("formato de extrato não reconhecido"));
        ParsedStatement result = parser.parse(file);
        LOG.info("Statement parsed: parser={} entries={}", parser.name(), result.entries().size());
        if (result.entries().isEmpty()) {
            throw new InvalidDataException("nenhum lançamento encontrado no arquivo");
        }
        return result;
    }
}
