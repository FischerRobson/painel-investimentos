package br.com.painel.controller;

import br.com.painel.repository.DocumentStore.Condition;

final class Preconditions {

    private Preconditions() {
    }

    static Condition from(String ifMatch, String ifNoneMatch) {
        if (ifMatch != null && !ifMatch.isBlank()) {
            return Condition.matches(ifMatch.replace("\"", "").strip());
        }
        if (ifNoneMatch != null && ifNoneMatch.strip().equals("*")) {
            return Condition.absent();
        }
        throw new PreconditionRequiredException();
    }

    static String quote(String etag) {
        return "\"" + etag + "\"";
    }
}
