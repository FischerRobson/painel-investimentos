package br.com.painel.controller;

public class PreconditionRequiredException extends RuntimeException {

    public PreconditionRequiredException() {
        super("missing If-Match or If-None-Match");
    }
}
