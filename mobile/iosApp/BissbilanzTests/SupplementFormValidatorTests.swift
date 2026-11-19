@testable import Bissbilanz
import Foundation
import Testing

@Suite("Supplement form validator")
struct SupplementFormValidatorTests {
    private static let vitamin = SupplementFormValidator.Ingredient(
        name: "Vitamin D", dosage: "20", hasOriginalText: false
    )

    private static func valid(
        name: String = "Vitamin D",
        type: ScheduleType = .daily,
        days: Set<Int> = [],
        ingredients: [SupplementFormValidator.Ingredient] = [SupplementFormValidatorTests.vitamin]
    ) -> Bool {
        SupplementFormValidator.isValid(
            name: name, scheduleType: type, scheduleDays: days, ingredients: ingredients
        )
    }

    @Test("only weekly and custom schedules need days")
    func requiresScheduleDays() {
        #expect(SupplementFormValidator.requiresScheduleDays(.weekly))
        #expect(SupplementFormValidator.requiresScheduleDays(.specificDays))
        #expect(!SupplementFormValidator.requiresScheduleDays(.daily))
        #expect(!SupplementFormValidator.requiresScheduleDays(.everyOtherDay))
    }

    @Test("a weekly or custom schedule without days is missing days")
    func missingScheduleDays() {
        #expect(SupplementFormValidator.isMissingScheduleDays(type: .weekly, days: []))
        #expect(SupplementFormValidator.isMissingScheduleDays(type: .specificDays, days: []))
        #expect(!SupplementFormValidator.isMissingScheduleDays(type: .weekly, days: [1]))
        #expect(!SupplementFormValidator.isMissingScheduleDays(type: .specificDays, days: [0, 6]))
    }

    @Test("daily and every-other-day schedules never need days")
    func dailyAndEveryOtherDayIgnoreDays() {
        #expect(!SupplementFormValidator.isMissingScheduleDays(type: .daily, days: []))
        #expect(!SupplementFormValidator.isMissingScheduleDays(type: .everyOtherDay, days: []))
        #expect(Self.valid(type: .daily))
        #expect(Self.valid(type: .everyOtherDay))
    }

    @Test("weekly without days is invalid, with a day it is valid")
    func weeklyNeedsADay() {
        #expect(!Self.valid(type: .weekly, days: []))
        #expect(Self.valid(type: .weekly, days: [3]))
    }

    @Test("custom without days is invalid, with days it is valid")
    func customNeedsADay() {
        #expect(!Self.valid(type: .specificDays, days: []))
        #expect(Self.valid(type: .specificDays, days: [1, 4]))
    }

    @Test("days left over from a weekly pick do not block a daily schedule")
    func staleDaysAreHarmless() {
        #expect(Self.valid(type: .daily, days: [2]))
    }

    @Test("a blank name is invalid")
    func blankName() {
        #expect(!Self.valid(name: ""))
        #expect(!Self.valid(name: "   "))
        #expect(!Self.valid(name: "\n"))
    }

    @Test("at least one ingredient is required")
    func needsAnIngredient() {
        #expect(!Self.valid(ingredients: []))
    }

    @Test("every ingredient needs a name")
    func ingredientNeedsAName() {
        let unnamed = SupplementFormValidator.Ingredient(name: " ", dosage: "20", hasOriginalText: false)
        #expect(!SupplementFormValidator.isValidIngredient(unnamed))
        #expect(!Self.valid(ingredients: [Self.vitamin, unnamed]))
    }

    @Test("an ingredient needs a positive dose or a preserved label")
    func ingredientNeedsADoseOrLabel() {
        func ingredient(_ dosage: String, label: Bool) -> SupplementFormValidator.Ingredient {
            SupplementFormValidator.Ingredient(name: "Zinc", dosage: dosage, hasOriginalText: label)
        }
        #expect(SupplementFormValidator.isValidIngredient(ingredient("15", label: false)))
        #expect(SupplementFormValidator.isValidIngredient(ingredient("0.5", label: false)))
        #expect(SupplementFormValidator.isValidIngredient(ingredient("0,5", label: false)))
        #expect(!SupplementFormValidator.isValidIngredient(ingredient("", label: false)))
        #expect(!SupplementFormValidator.isValidIngredient(ingredient("0", label: false)))
        #expect(!SupplementFormValidator.isValidIngredient(ingredient("-3", label: false)))
        #expect(!SupplementFormValidator.isValidIngredient(ingredient("abc", label: false)))
        #expect(SupplementFormValidator.isValidIngredient(ingredient("", label: true)))
        #expect(SupplementFormValidator.isValidIngredient(ingredient("abc", label: true)))
    }

    @Test("a form the validator accepts is due on at least one day of the week")
    func acceptedFormsAreEventuallyDue() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "UTC"))
        let monday = try #require(calendar.date(from: DateComponents(year: 2026, month: 2, day: 16)))
        let week = (0 ..< 7).compactMap { calendar.date(byAdding: .day, value: $0, to: monday) }

        let forms: [(ScheduleType, Set<Int>)] = [
            (.daily, []), (.everyOtherDay, []), (.weekly, [2]), (.specificDays, [0, 5]),
        ]
        for (type, days) in forms {
            #expect(Self.valid(type: type, days: days))
            let due = week.contains {
                SupplementSchedule.isDue(
                    scheduleType: type,
                    scheduleDays: days.isEmpty ? nil : Array(days).sorted(),
                    scheduleStartDate: nil,
                    on: $0,
                    calendar: calendar
                )
            }
            #expect(due)
        }
    }

    @Test("the schedule a rejected weekly form would have stored is never due")
    func rejectedFormsWouldNeverBeDue() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "UTC"))
        let monday = try #require(calendar.date(from: DateComponents(year: 2026, month: 2, day: 16)))
        let week = (0 ..< 7).compactMap { calendar.date(byAdding: .day, value: $0, to: monday) }

        for type in [ScheduleType.weekly, .specificDays] {
            #expect(!Self.valid(type: type, days: []))
            let due = week.contains {
                SupplementSchedule.isDue(
                    scheduleType: type, scheduleDays: nil, scheduleStartDate: nil, on: $0, calendar: calendar
                )
            }
            #expect(!due)
        }
    }
}
