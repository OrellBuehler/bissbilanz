import Foundation

struct Goals: Codable {
    let calorieGoal: Double
    let proteinGoal: Double
    let carbGoal: Double
    let fatGoal: Double
    let fiberGoal: Double
    let sodiumGoal: Double?
    let sugarGoal: Double?

    static let defaults = Goals(
        calorieGoal: 2000,
        proteinGoal: 150,
        carbGoal: 250,
        fatGoal: 65,
        fiberGoal: 30,
        sodiumGoal: nil,
        sugarGoal: nil
    )
}

struct GoalsResponse: Codable {
    let goals: Goals?
}
