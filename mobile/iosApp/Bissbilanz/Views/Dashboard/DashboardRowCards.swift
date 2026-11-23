import SwiftUI

struct DashboardFastingCard: View {
    @Environment(FastingTimerManager.self) private var fastingManager

    var body: some View {
        NavigationLink {
            FastingView()
        } label: {
            DashboardFastingCardLabel(session: fastingManager.session)
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
    }
}

private struct DashboardFastingCardLabel: View {
    let session: FastingSession?

    var body: some View {
        HStack(spacing: 12) {
            IconTile(systemImage: "timer", tint: MacroColors.fasting)
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.fasting)
                    .font(.brand(.caption, weight: .semibold))
                    .foregroundStyle(Brand.textSecondary)
                if let session {
                    Text(timerInterval: session.elapsedRange, countsDown: false)
                        .font(.brand(.headline, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.text)
                        // Date-relative Text is greedy about width — cap it
                        // so the trailing target label isn't squeezed out.
                        .frame(maxWidth: 100, alignment: .leading)
                } else {
                    Text(L10n.startFast)
                        .font(.brand(.headline, weight: .semibold))
                        .foregroundStyle(Brand.text)
                }
            }
            Spacer(minLength: 8)
            if let session {
                MacroTinted(macro: .fasting) { tint in
                    Chip(L10n.fastingTargetHours(session.targetHours), tint: tint)
                }
            }
            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(Brand.textSecondary)
                .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(padding: Brand.Spacing.compact)
    }
}

struct DashboardFastingDayCard: View {
    let isOn: Bool
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            IconTile(systemImage: "fork.knife", tint: Brand.textSecondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.fastingDay)
                    .font(.brand(.subheadline, weight: .semibold))
                    .foregroundStyle(Brand.text)
                Text(L10n.fastingDayDescription)
                    .font(.caption)
                    .foregroundStyle(Brand.textSecondary)
            }
            Spacer(minLength: 8)
            Toggle("", isOn: Binding(get: { isOn }, set: { _ in onToggle() }))
                .labelsHidden()
                .accessibilityLabel(L10n.fastingDay)
                .accessibilityHint(L10n.fastingDayDescription)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(padding: Brand.Spacing.compact)
    }
}

struct DashboardWeightCard: View {
    let entry: WeightEntry
    let caption: String
    let fillHeight: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                IconTile(systemImage: "scalemass", tint: Brand.accent, size: 28)
                Text(L10n.weight)
                    .font(.brand(.caption, weight: .semibold))
                    .foregroundStyle(Brand.textSecondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            Text("\(entry.weightKg, specifier: "%.1f") kg")
                .font(.brand(.title3, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Brand.text)
            Text(caption)
                .font(.caption2)
                .foregroundStyle(Brand.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: fillHeight ? .infinity : nil, alignment: .topLeading)
        .card(padding: Brand.Spacing.compact)
        .accessibilityElement(children: .combine)
    }
}

struct DashboardSleepCard: View {
    let sleep: SleepEntry?
    let caption: String
    let fillHeight: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                IconTile(systemImage: "bed.double", tint: .indigo, size: 28)
                Text(L10n.sleep)
                    .font(.brand(.caption, weight: .semibold))
                    .foregroundStyle(Brand.textSecondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            if let sleep {
                Text(formatSleepDuration(sleep.durationMinutes))
                    .font(.brand(.title3, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.text)
                Text("\(formatSleepQuality(sleep.quality))/10 · \(caption)")
                    .font(.caption2)
                    .foregroundStyle(Brand.textSecondary)
            } else {
                Text(L10n.logSleep)
                    .font(.brand(.headline, weight: .semibold))
                    .foregroundStyle(Brand.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: fillHeight ? .infinity : nil, alignment: .topLeading)
        .card(padding: Brand.Spacing.compact)
        .accessibilityElement(children: .combine)
    }
}

struct DashboardSupplementsCard: View {
    let items: [SupplementChecklist]
    let onToggle: (SupplementChecklist) -> Void

    private var takenCount: Int {
        items.count(where: \.taken)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CardHeader(L10n.supplements, systemImage: "pills", tint: .purple) {
                Chip(
                    "\(takenCount)/\(items.count)",
                    tint: takenCount == items.count ? Brand.success : Brand.textSecondary
                )
            }

            VStack(spacing: 0) {
                ForEach(items) { item in
                    DashboardSupplementRow(item: item) { onToggle(item) }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}

private struct DashboardSupplementRow: View {
    let item: SupplementChecklist
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 10) {
                Image(systemName: item.taken ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(item.taken ? Brand.success : Brand.textSecondary)
                    .accessibilityHidden(true)
                Text(item.supplement.name)
                    .font(.subheadline)
                    .foregroundStyle(item.taken ? Brand.textSecondary : Brand.text)
                Spacer()
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(item.supplement.name)
        .accessibilityValue(item.taken ? L10n.markTaken : L10n.notTakenYet)
        .accessibilityAddTraits(item.taken ? .isSelected : [])
    }
}
