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
