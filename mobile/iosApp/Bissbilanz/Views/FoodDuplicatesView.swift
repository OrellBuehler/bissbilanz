import SwiftUI

/// Server-computed candidate groups for foods that may be the same product —
/// same barcode, same normalized name+brand, or a similar name with
/// near-identical per-serving macros (`GET /api/foods/duplicates`). Reached
/// from the Foods tab; resolving a group opens `FoodMergeSheet` to pick the
/// keeper and review what the merge keeps. Online-only, like the fetch itself:
/// `FoodRepository.fetchDuplicates`/`mergeFoods` both require an account.
struct FoodDuplicatesView: View {
    @Environment(FoodRepository.self) private var foodRepository

    @State private var groups: [FoodDuplicateGroup] = []
    @State private var isLoading = true
    @State private var error: Error?
    /// The group being reviewed in `FoodMergeSheet`, with its full foods.
    @State private var mergeCandidates: FoodMergeCandidates?
    /// The group whose foods are being fetched before the sheet can open.
    @State private var loadingGroupId: String?
    @State private var errorMessage: String?
    @State private var toastMessage: String?

    var body: some View {
        Group {
            if isLoading {
                LoadingView()
            } else if let error {
                ErrorView(error: error) { Task { await loadDuplicates() } }
            } else if groups.isEmpty {
                ContentUnavailableView(
                    L10n.foodsDuplicatesTitle,
                    systemImage: "checkmark.circle",
                    description: Text(L10n.foodsDuplicatesEmpty)
                )
            } else {
                List {
                    Section {
                        Text(L10n.foodsDuplicatesDescription)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(groups) { group in
                        groupSection(group)
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle(L10n.foodsDuplicatesTitle)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await loadDuplicates() }
        .task { await loadDuplicates() }
        .toast(message: $toastMessage)
        .sheet(item: $mergeCandidates) { candidates in
            FoodMergeSheet(candidates: candidates) { _ in
                toastMessage = L10n.foodsMergeSuccess
                Task { await loadDuplicates() }
            }
        }
        .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
    }

    private func groupSection(_ group: FoodDuplicateGroup) -> some View {
        Section(reasonText(group.reason)) {
            ForEach(group.foods) { food in
                VStack(alignment: .leading, spacing: 2) {
                    Text(food.name)
                    if let brand = food.brand, !brand.isEmpty {
                        Text(brand)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Button {
                Task { await openMerge(group) }
            } label: {
                HStack {
                    Label(L10n.foodsDuplicatesResolve, systemImage: "arrow.triangle.merge")
                    if loadingGroupId == group.id {
                        Spacer()
                        ProgressView()
                    }
                }
            }
            .disabled(loadingGroupId != nil)
        }
    }

    private func reasonText(_ reason: FoodDuplicateReason) -> String {
        switch reason {
        case .barcode: L10n.foodsDuplicatesReasonBarcode
        case .nameBrand: L10n.foodsDuplicatesReasonNameBrand
        case .similar: L10n.foodsDuplicatesReasonSimilar
        }
    }

    private func loadDuplicates() async {
        isLoading = groups.isEmpty
        error = nil
        do {
            groups = try await foodRepository.fetchDuplicates()
        } catch {
            if groups.isEmpty { self.error = error }
        }
        isLoading = false
    }

    /// Opens the merge review with the group's full foods — the local copy
    /// when there is one, otherwise fetched from the server first.
    private func openMerge(_ group: FoodDuplicateGroup) async {
        guard loadingGroupId == nil else { return }
        loadingGroupId = group.id
        defer { loadingGroupId = nil }
        var foods: [Food] = []
        for candidate in group.foods {
            if foodRepository.food(id: candidate.id) == nil {
                do {
                    try await foodRepository.refreshFood(id: candidate.id)
                } catch {
                    ErrorReporter.captureWarning(
                        "Duplicate merge candidate fetch failed",
                        context: ["reason": ErrorReporter.reason(for: error)]
                    )
                }
            }
            if let food = foodRepository.food(id: candidate.id) {
                foods.append(food)
            }
        }
        guard foods.count == group.foods.count else {
            errorMessage = L10n.foodMergeLoadFailed
            return
        }
        mergeCandidates = FoodMergeCandidates(foods: foods)
    }
}
