package br.com.painel.repository;

import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectResponse;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.util.Optional;

public class S3DocumentStore implements DocumentStore {

    private final S3Client s3;
    private final String bucket;

    public S3DocumentStore(S3Client s3, String bucket) {
        this.s3 = s3;
        this.bucket = bucket;
    }

    @Override
    public Optional<Document> read(String key) {
        try {
            ResponseBytes<GetObjectResponse> obj = s3.getObjectAsBytes(b -> b.bucket(bucket).key(key));
            return Optional.of(new Document(obj.asByteArray(), unquote(obj.response().eTag())));
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        }
    }

    @Override
    public String write(String key, byte[] body, Condition condition) {
        PutObjectRequest.Builder req = PutObjectRequest.builder().bucket(bucket).key(key).contentType("application/json");
        switch (condition.kind()) {
            case ABSENT -> req.ifNoneMatch("*");
            case MATCH -> req.ifMatch("\"" + condition.etag() + "\"");
            case ANY -> { }
        }
        try {
            PutObjectResponse res = s3.putObject(req.build(), RequestBody.fromBytes(body));
            return unquote(res.eTag());
        } catch (S3Exception e) {
            // 412: a condição falhou; 409: outra escrita condicional no mesmo objeto ao mesmo tempo
            if (e.statusCode() == 412 || e.statusCode() == 409) {
                throw new PreconditionFailedException(key);
            }
            throw e;
        }
    }

    private static String unquote(String etag) {
        return etag == null ? null : etag.replace("\"", "");
    }
}
