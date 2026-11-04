package br.com.painel.repository;

public class PreconditionFailedException extends RuntimeException {

    public PreconditionFailedException(String key) {
        super("document " + key + " was changed by another session");
    }
}
