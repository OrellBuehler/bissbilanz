import SwiftUI

struct EnhanceFoodsView: View {
    @Environment(FoodEnrichmentController.self) private var controller
    @Environment(AppModeManager.self) private var appMode
    @Environment(ConnectivityMonitor.self) private var connectivity

    var body: some View {
        List {
            Section {
                Text(L10n.enhanceFoodsExplanation)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if !connectivity.isOnline {
                Section {
                    Label(L10n.enhanceFoodsOffline, systemImage: "wifi.slash")
                        .foregroundStyle(.secondary)
                }
            }
            if appMode.isLocal {
                localContent
            } else {
                serverContent
            }
            if let notice = controller.notice {
                Section {
                    Label(L10n.enhanceFoodsNotice(notice), systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                }
            }
        }
        .navigationTitle(L10n.enhanceFoods)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: connectivity.isOnline) { await controller.refreshForScreen() }
        .task(id: controller.shouldPoll) {
            if controller.shouldPoll {
                await controller.pollWhileActive()
            }
        }
    }

    @ViewBuilder
    private var serverContent: some View {
        if let status = controller.status {
            if let job = status.job, job.phase.isActive {
                activeJobSection(job)
                stopSection {
                    Task { await controller.cancelJob() }
                }
            } else {
                idleJobSection(status)
                startSection(disabled: status.candidates == 0) {
                    Task { await controller.startJob() }
                }
            }
        } else if connectivity.isOnline, !controller.loadFailed {
            Section {
                HStack(spacing: 12) {
                    ProgressView()
                    Text(L10n.loading)
                        .foregroundStyle(.secondary)
                }
            }
        }
        if controller.loadFailed {
            Section {
                Text(L10n.enhanceFoodsLoadFailed)
                    .foregroundStyle(.red)
                Button(L10n.retry) {
                    Task { await controller.refreshStatus() }
                }
                .disabled(!connectivity.isOnline)
            }
        }
    }

    private func activeJobSection(_ job: FoodEnrichmentJob) -> some View {
        Section {
            HStack(spacing: 12) {
                ProgressView()
                Text(L10n.enhanceFoodsJobProgress(job))
                    .font(.subheadline)
            }
            ProgressView(value: Self.fraction(job.processed, of: job.total))
            countsText(updated: job.updated, notFound: job.notFound, failed: job.failed)
        } footer: {
            Text(L10n.enhanceFoodsServerNote)
        }
    }

    private func idleJobSection(_ status: FoodEnrichmentStatus) -> some View {
        Section {
            Text(status.candidates > 0 ? L10n.enhanceFoodsCandidates(status.candidates) : L10n.enhanceFoodsNone)
            if let job = status.job {
                VStack(alignment: .leading, spacing: 4) {
                    Text(Self.lastRunText(job))
                        .font(.subheadline)
                    countsText(updated: job.updated, notFound: job.notFound, failed: job.failed)
                }
            }
        }
    }

    @ViewBuilder
    private var localContent: some View {
        if controller.sweep.state == .running {
            runningSweepSection(controller.sweep)
            stopSection {
                controller.stopLocalSweep()
            }
        } else {
            idleSweepSection(controller.sweep)
            startSection(disabled: controller.localCandidateCount == 0) {
                controller.startLocalSweep()
            }
        }
    }

    private func runningSweepSection(_ sweep: LocalSweepProgress) -> some View {
        Section {
            HStack(spacing: 12) {
                ProgressView()
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.enhanceFoodsProgress(sweep.done, sweep.total))
                        .font(.subheadline)
                    if let detail = Self.sweepDetail(sweep) {
                        Text(detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
            ProgressView(value: Self.fraction(sweep.done, of: sweep.total))
            countsText(updated: sweep.updated, notFound: sweep.notFound, failed: sweep.failed)
        } footer: {
            Text(L10n.enhanceFoodsDeviceNote)
        }
    }

    private func idleSweepSection(_ sweep: LocalSweepProgress) -> some View {
        Section {
            Text(controller.localCandidateCount > 0
                ? L10n.enhanceFoodsCandidates(controller.localCandidateCount)
                : L10n.enhanceFoodsNone)
            if let summary = Self.sweepSummary(sweep) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(summary)
                        .font(.subheadline)
                    countsText(updated: sweep.updated, notFound: sweep.notFound, failed: sweep.failed)
                }
            }
        }
    }

    private func countsText(updated: Int, notFound: Int, failed: Int) -> some View {
        Text(L10n.enhanceFoodsCounts(updated: updated, notFound: notFound, failed: failed))
            .font(.caption)
            .foregroundStyle(.secondary)
            .monospacedDigit()
    }

    private func startSection(disabled: Bool, action: @escaping () -> Void) -> some View {
        Section {
            Button(action: action) {
                Label(L10n.enhanceFoodsStart, systemImage: "wand.and.stars")
            }
            .disabled(disabled || controller.isSubmitting || controller.isSweepRunning || !connectivity.isOnline)
        }
    }

    private func stopSection(action: @escaping () -> Void) -> some View {
        Section {
            Button(role: .destructive, action: action) {
                Label(L10n.enhanceFoodsStop, systemImage: "stop.circle")
            }
            .disabled(controller.isSubmitting)
        }
    }

    nonisolated static func fraction(_ done: Int, of total: Int) -> Double {
        guard total > 0 else { return 0 }
        return min(1, max(0, Double(done) / Double(total)))
    }

    nonisolated static func lastRunText(_ job: FoodEnrichmentJob) -> String {
        let locale = Locale(identifier: L10n.currentLocale.rawValue)
        let date = job.finishedAt
            .flatMap(DateFormatting.isoDateTime(from:))
            .map { $0.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened, locale: locale)) }
        switch job.phase {
        case .cancelled:
            return L10n.enhanceFoodsLastCancelled(date: date, processed: job.processed, total: job.total)
        case .failed:
            return L10n.enhanceFoodsLastFailed(date: date, processed: job.processed, total: job.total)
        case .queued, .running, .completed, .unknown:
            return L10n.enhanceFoodsLastCompleted(date: date, processed: job.processed)
        }
    }

    nonisolated static func sweepDetail(_ sweep: LocalSweepProgress) -> String? {
        sweep.isWaiting ? L10n.enhanceFoodsWaiting : sweep.currentFoodName
    }

    nonisolated static func sweepSummary(_ sweep: LocalSweepProgress) -> String? {
        switch sweep.state {
        case .idle, .running:
            return nil
        case .completed:
            return L10n.enhanceFoodsLastCompleted(date: nil, processed: sweep.done)
        case .stopped:
            return L10n.enhanceFoodsLastCancelled(date: nil, processed: sweep.done, total: sweep.total)
        case .failed:
            return L10n.enhanceFoodsLastFailed(date: nil, processed: sweep.done, total: sweep.total)
        case .offline:
            return sweep.total > 0 ? L10n.enhanceFoodsLastOffline(processed: sweep.done, total: sweep.total) : nil
        }
    }
}
