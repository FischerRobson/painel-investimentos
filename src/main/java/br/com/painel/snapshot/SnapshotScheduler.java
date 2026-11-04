package br.com.painel.snapshot;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;

// Local runs only: on Lambda the scheduler is disabled and EventBridge Scheduler calls SnapshotController instead.
@ApplicationScoped
public class SnapshotScheduler {

    private final SnapshotService service;

    public SnapshotScheduler(SnapshotService service) {
        this.service = service;
    }

    @Scheduled(cron = "{painel.snapshot.cron}", timeZone = "America/Sao_Paulo", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void dailySnapshot() {
        service.takeAll();
    }
}
