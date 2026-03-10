import SwiftUI

struct InsightsView: View {
    @EnvironmentObject var api: BissbilanzAPI

    @State private var weeklyStats: MacroTotals?
    @State private var monthlyStats: MacroTotals?
    @State private var streaks: StreaksResponse?
    @State private var topFoods: [TopFoodEntry] = []
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if isLoading {
                        LoadingView()
                    } else {
                        streaksCard
                        weeklyCard
                        monthlyCard
                        topFoodsCard
                    }
                }
                .padding()
            }
            .navigationTitle("Insights")
            .refreshable { await loadAll() }
            .task { await loadAll() }
        }
    }

    @ViewBuilder
    private var streaksCard: some View {
        if let streaks {
            CardView {
                VStack(spacing: 12) {
                    Label("Streaks", systemImage: "flame")
                        .font(.headline)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: 32) {
                        VStack {
                            Text("\(streaks.currentStreak)")
                                .font(.system(size: 36, weight: .bold))
                                .foregroundStyle(MacroColors.calories)
                            Text("Current")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        VStack {
                            Text("\(streaks.longestStreak)")
                                .font(.system(size: 36, weight: .bold))
                                .foregroundStyle(MacroColors.fiber)
                            Text("Longest")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var weeklyCard: some View {
        if let stats = weeklyStats {
            CardView {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Weekly Average", systemImage: "calendar")
                        .font(.headline)

                    NutrientRow(label: "Calories", value: stats.calories, unit: "kcal", color: MacroColors.calories)
                    NutrientRow(label: "Protein", value: stats.protein, unit: "g", color: MacroColors.protein)
                    NutrientRow(label: "Carbs", value: stats.carbs, unit: "g", color: MacroColors.carbs)
                    NutrientRow(label: "Fat", value: stats.fat, unit: "g", color: MacroColors.fat)
                    NutrientRow(label: "Fiber", value: stats.fiber, unit: "g", color: MacroColors.fiber)
                }
            }
        }
    }

    @ViewBuilder
    private var monthlyCard: some View {
        if let stats = monthlyStats {
            CardView {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Monthly Average", systemImage: "calendar.badge.clock")
                        .font(.headline)

                    NutrientRow(label: "Calories", value: stats.calories, unit: "kcal", color: MacroColors.calories)
                    NutrientRow(label: "Protein", value: stats.protein, unit: "g", color: MacroColors.protein)
                    NutrientRow(label: "Carbs", value: stats.carbs, unit: "g", color: MacroColors.carbs)
                    NutrientRow(label: "Fat", value: stats.fat, unit: "g", color: MacroColors.fat)
                    NutrientRow(label: "Fiber", value: stats.fiber, unit: "g", color: MacroColors.fiber)
                }
            }
        }
    }

    @ViewBuilder
    private var topFoodsCard: some View {
        if !topFoods.isEmpty {
            CardView {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Top Foods (7 days)", systemImage: "trophy")
                        .font(.headline)

                    ForEach(Array(topFoods.enumerated()), id: \.element.id) { index, food in
                        HStack {
                            Text("\(index + 1).")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 20, alignment: .leading)
                            Text(food.foodName)
                                .lineLimit(1)
                            Spacer()
                            Text("\(food.count)x")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("\(Int(food.calories)) cal")
                                .font(.caption)
                                .foregroundStyle(MacroColors.calories)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
    }

    private func loadAll() async {
        isLoading = true
        async let w = try? api.getWeeklyStats()
        async let m = try? api.getMonthlyStats()
        async let s = try? api.getStreaks()
        async let t = try? api.getTopFoods()

        weeklyStats = await w
        monthlyStats = await m
        streaks = await s
        topFoods = await t ?? []
        isLoading = false
    }
}

struct CardView<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
