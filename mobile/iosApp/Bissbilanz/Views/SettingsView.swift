import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authManager: AuthManager
    @EnvironmentObject var api: BissbilanzAPI

    @State private var goals: Goals = .defaults
    @State private var isEditingGoals = false
    @State private var showLogoutConfirmation = false

    @State private var editCalories = ""
    @State private var editProtein = ""
    @State private var editCarbs = ""
    @State private var editFat = ""
    @State private var editFiber = ""

    var body: some View {
        NavigationStack {
            List {
                Section("Goals") {
                    goalRow("Calories", value: goals.calorieGoal, unit: "kcal", color: MacroColors.calories)
                    goalRow("Protein", value: goals.proteinGoal, unit: "g", color: MacroColors.protein)
                    goalRow("Carbs", value: goals.carbGoal, unit: "g", color: MacroColors.carbs)
                    goalRow("Fat", value: goals.fatGoal, unit: "g", color: MacroColors.fat)
                    goalRow("Fiber", value: goals.fiberGoal, unit: "g", color: MacroColors.fiber)

                    Button("Edit Goals") {
                        editCalories = "\(Int(goals.calorieGoal))"
                        editProtein = "\(Int(goals.proteinGoal))"
                        editCarbs = "\(Int(goals.carbGoal))"
                        editFat = "\(Int(goals.fatGoal))"
                        editFiber = "\(Int(goals.fiberGoal))"
                        isEditingGoals = true
                    }
                }

                Section("Account") {
                    Button(role: .destructive) {
                        showLogoutConfirmation = true
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }

                Section("About") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Settings")
            .confirmationDialog("Sign out?", isPresented: $showLogoutConfirmation) {
                Button("Sign Out", role: .destructive) {
                    authManager.logout()
                }
            } message: {
                Text("You will need to sign in again to use the app.")
            }
            .sheet(isPresented: $isEditingGoals) {
                goalsEditor
            }
            .task {
                do {
                    goals = try await api.getGoals() ?? .defaults
                } catch {}
            }
        }
    }

    private func goalRow(_ label: String, value: Double, unit: String, color: Color) -> some View {
        HStack {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
            Spacer()
            Text("\(Int(value)) \(unit)")
                .foregroundStyle(.secondary)
        }
    }

    private var goalsEditor: some View {
        NavigationStack {
            Form {
                Section("Daily Goals") {
                    goalField("Calories (kcal)", text: $editCalories)
                    goalField("Protein (g)", text: $editProtein)
                    goalField("Carbs (g)", text: $editCarbs)
                    goalField("Fat (g)", text: $editFat)
                    goalField("Fiber (g)", text: $editFiber)
                }
            }
            .navigationTitle("Edit Goals")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isEditingGoals = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await saveGoals() }
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }

    private func goalField(_ label: String, text: Binding<String>) -> some View {
        HStack {
            Text(label)
            Spacer()
            TextField("", text: text)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
        }
    }

    private func saveGoals() async {
        let newGoals = Goals(
            calorieGoal: Double(editCalories) ?? goals.calorieGoal,
            proteinGoal: Double(editProtein) ?? goals.proteinGoal,
            carbGoal: Double(editCarbs) ?? goals.carbGoal,
            fatGoal: Double(editFat) ?? goals.fatGoal,
            fiberGoal: Double(editFiber) ?? goals.fiberGoal,
            sodiumGoal: goals.sodiumGoal,
            sugarGoal: goals.sugarGoal
        )
        do {
            goals = try await api.setGoals(newGoals)
        } catch {}
        isEditingGoals = false
    }
}
