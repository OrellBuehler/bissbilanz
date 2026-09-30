import Charts
import SwiftUI

extension DashboardView {
    // MARK: - Macro Rings

    var macroRings: some View {
        let adjustedGoals = activityAdjustment.goals
        return VStack(spacing: 4) {
            HStack(spacing: 16) {
                MacroRingView(
                    label: "Cal",
                    accessibilityName: L10n.calories,
                    current: totalCalories,
                    goal: adjustedGoals.calorieGoal,
                    macro: .calories,
                    showGoal: true
                )
                MacroRingView(
                    label: "P",
                    accessibilityName: L10n.protein,
                    current: totalProtein,
                    goal: adjustedGoals.proteinGoal,
                    macro: .protein,
                    showGoal: true,
                    animationDelay: 0.05
                )
                MacroRingView(
                    label: "C",
                    accessibilityName: L10n.carbs,
                    current: totalCarbs,
                    goal: adjustedGoals.carbGoal,
                    macro: .carbs,
                    showGoal: true,
                    animationDelay: 0.1
                )
                MacroRingView(
                    label: "F",
                    accessibilityName: L10n.fat,
                    current: totalFat,
                    goal: adjustedGoals.fatGoal,
                    macro: .fat,
                    showGoal: true,
                    animationDelay: 0.15
                )
                MacroRingView(
                    label: "Fb",
                    accessibilityName: L10n.fiber,
                    current: totalFiber,
                    goal: adjustedGoals.fiberGoal,
                    macro: .fiber,
                    showGoal: true,
                    animationDelay: 0.2
                )
            }
            if activityAdjustment.activityBonus > 0 {
                Text(L10n.daySummaryActivityBonus(activityAdjustment.activityBonus))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// Informational — activity calories are tracked for reference, and only
    /// raise the calorie ring/goal above when `preferences.activityGoalAdjustment`
    /// is on (see `activityAdjustment` and the caption under the rings).
    func activitySummaryLine(_ calories: Int) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill")
                .foregroundStyle(.orange)
                .font(.caption)
                .accessibilityHidden(true)
            Text(L10n.daySummaryActivity(calories))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Fasting Card

    /// Entry point to the fasting tracker; only rendered on today (a fast is
    /// a "now" concept, not tied to the browsed date). Shows the live elapsed
    /// timer while a fast is running.
    var fastingCard: some View {
        NavigationLink {
            FastingView()
        } label: {
            HStack {
                Image(systemName: "timer")
                    .foregroundStyle(MacroColors.fasting)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.fasting)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let session = fastingManager.session {
                        Text(timerInterval: session.elapsedRange, countsDown: false)
                            .font(.headline)
                            .monospacedDigit()
                            // Date-relative Text is greedy about width — cap it
                            // so the trailing target label isn't squeezed out.
                            .frame(maxWidth: 100, alignment: .leading)
                    } else {
                        Text(L10n.startFast)
                            .font(.headline)
                    }
                }
                Spacer()
                if let session = fastingManager.session {
                    Text(L10n.fastingTargetHours(session.targetHours))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .padding(12)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Weight Widget

    /// `fillHeight` stretches the card to its row partner's height when the
    /// weight and sleep cards share a row; a lone card hugs its content.
    func weightWidget(_ entry: WeightEntry, fillHeight: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: "scalemass")
                    .foregroundStyle(.blue)
                    .accessibilityHidden(true)
                Text(L10n.weight)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            Text("\(entry.weightKg, specifier: "%.1f") kg")
                .font(.headline)
            Text(entryDateCaption(entry.entryDate))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: fillHeight ? .infinity : nil, alignment: .topLeading)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    // MARK: - Sleep Widget

    /// Sleep for the night nearest the selected day (a night is keyed by its
    /// wake day), captioned with the entry's own date. On today the card keeps
    /// the log prompt until last night is actually logged.
    func sleepWidget(fillHeight: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: "bed.double")
                    .foregroundStyle(.indigo)
                    .accessibilityHidden(true)
                Text(L10n.sleep)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            if let sleep = closestSleep, sleep.entryDate == dateString || !selectedDate.isToday {
                Text(formatSleepDuration(sleep.durationMinutes))
                    .font(.headline)
                Text("\(formatSleepQuality(sleep.quality))/10 · \(entryDateCaption(sleep.entryDate))")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            } else {
                Text(L10n.logSleep)
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: fillHeight ? .infinity : nil, alignment: .topLeading)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    // MARK: - Supplements Widget

    var supplementsWidget: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "pills")
                    .foregroundStyle(.purple)
                    .accessibilityHidden(true)
                Text(L10n.supplements)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                let taken = supplementChecklist.count(where: \.taken)
                Text("\(taken)/\(supplementChecklist.count)")
                    .font(.caption)
                    .foregroundStyle(taken == supplementChecklist.count ? .green : .secondary)
            }

            VStack(spacing: 0) {
                ForEach(supplementChecklist) { item in
                    Button {
                        Task { await toggleSupplement(item) }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: item.taken ? "checkmark.circle.fill" : "circle")
                                .font(.title3)
                                .foregroundStyle(item.taken ? .green : .secondary)
                                .accessibilityHidden(true)
                            Text(item.supplement.name)
                                .font(.subheadline)
                                .foregroundStyle(item.taken ? .secondary : .primary)
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
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Calorie Trend Widget

    /// Same line/goal-rule shape as the insights calorie chart, sized for a
    /// dashboard card. Hidden until the window holds at least two logged days —
    /// a single point is not a trend.
    /// Read before a VoiceOver user swipes through each day's data point.
    private var calorieTrendAccessibilitySummary: String {
        let logged = calorieTrend.filter { $0.calories > 0 }
        guard let first = logged.first, let last = logged.last else { return L10n.noEntries }
        let average = logged.reduce(0.0) { $0 + $1.calories } / Double(logged.count)
        var summary = L10n.chartAverageValue(MacroFormat.kcal(average), unit: L10n.calories)
        if logged.count > 1 {
            summary += ", " + (last.calories >= first.calories ? L10n.chartTrendingUp : L10n.chartTrendingDown)
        }
        return summary
    }

    @ViewBuilder
    var calorieTrendWidget: some View {
        if calorieTrend.count(where: { $0.calories > 0 }) >= 2 {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "chart.xyaxis.line")
                        .foregroundStyle(MacroColors.calories)
                        .accessibilityHidden(true)
                    Text(L10n.caloriesTrend)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    Text(L10n.last7Days)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Chart(calorieTrend) { point in
                    LineMark(
                        x: .value("Date", point.date),
                        y: .value("Calories", point.calories)
                    )
                    .foregroundStyle(MacroColors.calories)
                    .interpolationMethod(.catmullRom)

                    if goals.calorieGoal > 0 {
                        RuleMark(y: .value("Goal", goals.calorieGoal))
                            .foregroundStyle(.gray.opacity(0.5))
                            .lineStyle(StrokeStyle(dash: [5, 5]))
                            .accessibilityLabel(L10n.dailyGoals)
                            .accessibilityValue(MacroFormat.kcal(goals.calorieGoal))
                    }
                }
                .frame(height: 120)
                .chartXAxis(.hidden)
                .chartYAxis {
                    AxisMarks(position: .leading)
                }
                .accessibilityLabel(L10n.caloriesTrend)
                .accessibilityValue(calorieTrendAccessibilitySummary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Favorites Widget

    /// A one-tap row of the user's favorites: the quick-log button logs one
    /// serving at the meal the clock suggests, the card itself opens the full
    /// log form. Reads the local store, so it works offline and in Local mode.
    @ViewBuilder
    var favoritesWidget: some View {
        if !favoriteFoods.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "star.fill")
                        .foregroundStyle(.yellow)
                        .accessibilityHidden(true)
                    Text(L10n.favorites)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(favoriteFoods) { food in
                            FavoriteCard(
                                name: food.name,
                                brand: food.brand,
                                calories: Int(food.calories),
                                protein: Int(food.protein),
                                imageUrl: food.imageUrl,
                                onTap: { selectedFavorite = food },
                                onQuickLog: { Task { await quickLogFavorite(food) } }
                            )
                            .frame(width: 150)
                        }
                    }
                    .padding(.horizontal, 2)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Recipe Suggestions Widget

    /// Top 3 recipes that fit the day's remaining budget, with a link to the
    /// full ranking. Shown whenever the section is on (see `DashboardSection`),
    /// even with no recipes yet — the empty states explain what's missing.
    var recipeSuggestionsWidget: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "fork.knife.circle")
                    .foregroundStyle(MacroColors.protein)
                    .accessibilityHidden(true)
                Text(L10n.recipeSuggestionsCardTitle)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                NavigationLink {
                    RecipeSuggestionsView()
                } label: {
                    Text(L10n.showAll)
                        .font(.caption)
                }
            }

            if allRecipes.isEmpty {
                Text(L10n.recipeSuggestionsNoRecipesDescription)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if remainingBudget.calories < LocalRecipeSuggestions.minRemainingCalories {
                Text(L10n.recipeSuggestionsGoalReachedDescription)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if recipeSuggestionsPreview.isEmpty {
                Text(L10n.recipeSuggestionsNoMatchesDescription)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                VStack(spacing: 6) {
                    ForEach(recipeSuggestionsPreview) { item in
                        recipeSuggestionRow(item)
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func recipeSuggestionRow(_ item: DashboardRecipeSuggestion) -> some View {
        HStack(spacing: 8) {
            Text(item.recipe.name)
                .font(.subheadline)
                .lineLimit(1)
            Spacer()
            Text("\(MacroFormat.servings(item.suggestion.servings))\u{00D7}")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("\(MacroFormat.kcal(item.suggestion.calories)) kcal")
                .font(.caption)
                .monospacedDigit()
                .foregroundStyle(accessibleColor(.calories))
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Meal Breakdown Widget

    /// Where the day's calories went, meal by meal. Bars are proportional to
    /// the biggest meal so the shape reads at a glance.
    @ViewBuilder
    var mealBreakdownWidget: some View {
        if mealCalories.count > 1 {
            let peak = mealCalories.first?.calories ?? 0
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: "chart.pie")
                        .foregroundStyle(MacroColors.calories)
                        .accessibilityHidden(true)
                    Text(L10n.mealBreakdown)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                }

                ForEach(mealCalories) { item in
                    HStack(spacing: 10) {
                        Text(L10n.mealName(item.meal))
                            .font(.caption)
                            .lineLimit(1)
                            .frame(width: 76, alignment: .leading)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color(.systemGray5))
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(MacroColors.calories)
                                    .frame(width: geo.size.width * (peak > 0 ? item.calories / peak : 0))
                            }
                        }
                        .frame(height: 10)
                        .accessibilityHidden(true)
                        Text("\(MacroFormat.kcal(item.calories)) kcal")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                            .frame(width: 74, alignment: .trailing)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Top Foods Widget

    /// What the user logs most over the trend window, counted from the local
    /// entry log rather than the server's `/api/stats/top-foods`, so the card
    /// renders the same in Local mode.
    @ViewBuilder
    var topFoodsWidget: some View {
        if !topFoods.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "trophy")
                        .foregroundStyle(MacroColors.fat)
                        .accessibilityHidden(true)
                    Text(L10n.topFoods)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    Text(L10n.last7Days)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                ForEach(Array(topFoods.enumerated()), id: \.element.id) { index, food in
                    HStack(spacing: 8) {
                        Text("\(index + 1).")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(width: 20, alignment: .leading)
                        Text(food.name)
                            .font(.subheadline)
                            .lineLimit(1)
                        Spacer()
                        Text("\(food.count)\u{00D7}")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                        Text("\(MacroFormat.kcal(food.calories)) kcal")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(accessibleColor(.calories))
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}
