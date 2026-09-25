import SwiftUI

/// Server-computed candidate groups for foods that may be the same product —
/// same barcode, same normalized name+brand, or a similar name with
/// near-identical per-serving macros (`GET /api/foods/duplicates`). Reached
/// from the Foods tab; resolving a group picks one of its foods as the
/// keeper and merges the rest into it. Online-only, like the fetch itself:
/// `FoodRepository.fetchDuplicates`/`mergeFoods` both require an account.
struct FoodDuplicatesView: View {
    @Environment(FoodRepository.self) private var foodRepository

    @State private var groups: [FoodDuplicateGroup] = []
    @State private var isLoading = true
    @State private var error: Error?
    /// The group whose "Resolve" button is currently showing its
    /// pick-a-keeper action sheet.
    @State private var resolvingGroup: FoodDuplicateGroup?
    /// Set once a keeper is picked from `resolvingGroup`, driving the final
    /// confirmation alert before the merge actually runs.
    @State private var pendingMerge: (group: FoodDuplicateGroup, keeper: FoodDuplicateFood)?
    @State private var isMerging = false
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
        .confirmationDialog(
            L10n.foodsMergePickKeeper,
            isPresented: .init(get: { resolvingGroup != nil }, set: { if !$0 { resolvingGroup = nil } }),
            titleVisibility: .visible
        ) {
            if let resolvingGroup {
                ForEach(resolvingGroup.foods) { candidate in
                    Button(candidate.name) {
                        let group = resolvingGroup
                        self.resolvingGroup = nil
                        pendingMerge = (group, candidate)
                    }
                }
            }
            Button(L10n.cancel, role: .cancel) { resolvingGroup = nil }
        }
        .alert(
            L10n.foodsMergeTitle,
            isPresented: .init(get: { pendingMerge != nil }, set: { if !$0 { pendingMerge = nil } })
        ) {
            Button(L10n.foodsMergeConfirm, role: .destructive) {
                if let pendingMerge {
                    self.pendingMerge = nil
                    Task { await performMerge(group: pendingMerge.group, keeper: pendingMerge.keeper) }
                }
            }
            Button(L10n.cancel, role: .cancel) { pendingMerge = nil }
        } message: {
            if let pendingMerge {
                Text(L10n.foodsMergeDescription(pendingMerge.keeper.name))
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
                resolvingGroup = group
            } label: {
                Label(L10n.foodsDuplicatesResolve, systemImage: "arrow.triangle.merge")
            }
            .disabled(isMerging)
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

    /// Merges every other food in `group` into `keeper`.
    private func performMerge(group: FoodDuplicateGroup, keeper: FoodDuplicateFood) async {
        guard !isMerging else { return }
        isMerging = true
        defer { isMerging = false }
        let sourceIds = group.foods.map(\.id).filter { $0 != keeper.id }
        guard !sourceIds.isEmpty else { return }
        do {
            try await foodRepository.mergeFoods(keeperId: keeper.id, sourceIds: sourceIds)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            toastMessage = L10n.foodsMergeSuccess
            await loadDuplicates()
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            errorMessage = L10n.foodsMergeFailed
        }
    }
}
