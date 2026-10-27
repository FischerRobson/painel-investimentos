package br.com.painel.repository;

public class PreconditionFailedException extends RuntimeException {

    public PreconditionFailedException(String key) {
        super("O documento " + key + " foi alterado por outra sessão");
    }
}
