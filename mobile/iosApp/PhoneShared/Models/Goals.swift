import Foundation

struct Goals: Codable {
    let calorieGoal: Double
    let proteinGoal: Double
    let carbGoal: Double
    let fatGoal: Double
    let fiberGoal: Double
    let sodiumGoal: Double?
    let sugarGoal: Double?
    /// Optional body-weight target — see `goalsSchema` (`targetWeightKg`
    /// positive kg, `targetDate` "YYYY-MM-DD"). Defaulted to nil so the
    /// existing 7-argument memberwise-init call sites keep compiling.
    let targetWeightKg: Double?
    let targetDate: String?

    init(
        calorieGoal: Double,
        proteinGoal: Double,
        carbGoal: Double,
        fatGoal: Double,
        fiberGoal: Double,
        sodiumGoal: Double?,
        sugarGoal: Double?,
        targetWeightKg: Double? = nil,
        targetDate: String? = nil
    ) {
        self.calorieGoal = calorieGoal
        self.proteinGoal = proteinGoal
        self.carbGoal = carbGoal
        self.fatGoal = fatGoal
        self.fiberGoal = fiberGoal
        self.sodiumGoal = sodiumGoal
        self.sugarGoal = sugarGoal
        self.targetWeightKg = targetWeightKg
        self.targetDate = targetDate
    }

    static let defaults = Goals(
        calorieGoal: 2000,
        proteinGoal: 150,
        carbGoal: 250,
        fatGoal: 65,
        fiberGoal: 30,
        sodiumGoal: nil,
        sugarGoal: nil,
        targetWeightKg: nil,
        targetDate: nil
    )
}

extension Goals {
    private enum CodingKeys: String, CodingKey {
        case calorieGoal, proteinGoal, carbGoal, fatGoal, fiberGoal
        case sodiumGoal, sugarGoal, targetWeightKg, targetDate
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        calorieGoal = try container.decode(Double.self, forKey: .calorieGoal)
        proteinGoal = try container.decode(Double.self, forKey: .proteinGoal)
        carbGoal = try container.decode(Double.self, forKey: .carbGoal)
        fatGoal = try container.decode(Double.self, forKey: .fatGoal)
        fiberGoal = try container.decode(Double.self, forKey: .fiberGoal)
        sodiumGoal = try container.decodeIfPresent(Double.self, forKey: .sodiumGoal)
        sugarGoal = try container.decodeIfPresent(Double.self, forKey: .sugarGoal)
        targetWeightKg = try container.decodeIfPresent(Double.self, forKey: .targetWeightKg)
        targetDate = try container.decodeIfPresent(String.self, forKey: .targetDate)
    }

    /// `setGoals` always uploads the full object (never a sparse patch), so
    /// the target fields are encoded as an explicit JSON null rather than
    /// omitted when nil — otherwise clearing a previously-set target in the
    /// editor would leave the server's old value in place (`upsertGoals`
    /// only touches a column whose key is present in the body).
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(calorieGoal, forKey: .calorieGoal)
        try container.encode(proteinGoal, forKey: .proteinGoal)
        try container.encode(carbGoal, forKey: .carbGoal)
        try container.encode(fatGoal, forKey: .fatGoal)
        try container.encode(fiberGoal, forKey: .fiberGoal)
        try container.encodeIfPresent(sodiumGoal, forKey: .sodiumGoal)
        try container.encodeIfPresent(sugarGoal, forKey: .sugarGoal)
        try container.encode(targetWeightKg, forKey: .targetWeightKg)
        try container.encode(targetDate, forKey: .targetDate)
    }
}

struct GoalsResponse: Codable {
    let goals: Goals?
}

/// The result of `adjustGoalsForActivity`: the (possibly unchanged) goals
/// plus the whole-kcal bonus that was folded into `calorieGoal`.
struct ActivityAdjustedGoals {
    let goals: Goals
    let activityBonus: Int
}

/// Raises a day's calorie goal by a credited share of its workout activity
/// calories, and scales protein/carb/fat/fiber goals by the same factor so
/// macro ratios stay put. `sodiumGoal`/`sugarGoal`/`targetWeightKg`/
/// `targetDate` are untouched — they aren't calorie-proportional.
///
/// Returns `goals` unchanged with a zero bonus when the feature is off, there
/// are no (or non-positive) activity calories, or the day has no positive
/// calorie goal to scale from — mirrors the server's own adjustment (see the
/// activity-goal-adjustment server PR).
func adjustGoalsForActivity(
    goals: Goals,
    activityCalories: Int?,
    enabled: Bool,
    creditPercent: Int
) -> ActivityAdjustedGoals {
    guard enabled, let activityCalories, activityCalories > 0, goals.calorieGoal > 0 else {
        return ActivityAdjustedGoals(goals: goals, activityBonus: 0)
    }
    let bonus = Int((Double(activityCalories) * Double(creditPercent) / 100).rounded())
    guard bonus > 0 else {
        return ActivityAdjustedGoals(goals: goals, activityBonus: 0)
    }
    let adjustedCalorieGoal = goals.calorieGoal + Double(bonus)
    let factor = adjustedCalorieGoal / goals.calorieGoal
    let adjusted = Goals(
        calorieGoal: adjustedCalorieGoal,
        proteinGoal: (goals.proteinGoal * factor).rounded(),
        carbGoal: (goals.carbGoal * factor).rounded(),
        fatGoal: (goals.fatGoal * factor).rounded(),
        fiberGoal: (goals.fiberGoal * factor).rounded(),
        sodiumGoal: goals.sodiumGoal,
        sugarGoal: goals.sugarGoal,
        targetWeightKg: goals.targetWeightKg,
        targetDate: goals.targetDate
    )
    return ActivityAdjustedGoals(goals: adjusted, activityBonus: bonus)
}
