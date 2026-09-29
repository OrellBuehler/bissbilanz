import Foundation

private final class SharedFixtureBundleToken {}

/// One `{ fn, name, input, expected }` case from a JSON file the other platforms assert too:
/// `tests/fixtures/shared/` (web: `tests/shared-fixtures`, Android: `SharedFixturesTest`) and
/// `analytics-parity/fixtures/`. The files are bundled as test resources by `project.yml`.
struct SharedFixtureCase {
    let fn: String
    let name: String
    let input: [String: Any]
    let expected: Any

    var label: String { "\(fn)/\(name)" }
}

struct SharedFixtureFile {
    let tolerance: Double
    let cases: [SharedFixtureCase]
}

enum SharedFixtureError: Error, CustomStringConvertible {
    case missing(String)
    case malformed(String)

    var description: String {
        switch self {
        case let .missing(name): "\(name).json is missing from the test bundle"
        case let .malformed(reason): "malformed fixture: \(reason)"
        }
    }
}

enum SharedFixtures {
    static let platform = "swift"

    /// The cases this platform implements. A case whose fn is missing from the file's
    /// `implementations` throws, so a new function cannot be silently skipped; a documented
    /// known divergence replaces the expected value.
    static func load(_ name: String) throws -> SharedFixtureFile {
        guard let url = Bundle(for: SharedFixtureBundleToken.self).url(forResource: name, withExtension: "json") else {
            throw SharedFixtureError.missing(name)
        }
        let data = try Data(contentsOf: url)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rawCases = root["cases"] as? [[String: Any]]
        else {
            throw SharedFixtureError.malformed(name)
        }
        let implementations = root["implementations"] as? [String: [String]] ?? [:]

        var cases: [SharedFixtureCase] = []
        for raw in rawCases {
            guard let fn = raw["fn"] as? String,
                  let caseName = raw["name"] as? String,
                  let input = raw["input"] as? [String: Any]
            else {
                throw SharedFixtureError.malformed("\(name): case without fn/name/input")
            }
            guard let platforms = implementations[fn] else {
                throw SharedFixtureError.malformed("\(name): fn \(fn) is missing from implementations")
            }
            guard platforms.contains(platform) else { continue }
            var expected: Any = raw["expected"] ?? NSNull()
            let divergences = raw["divergences"] as? [[String: Any]] ?? []
            if let divergence = divergences.first(where: { ($0["platform"] as? String) == platform }) {
                expected = divergence["expected"] ?? NSNull()
            }
            cases.append(SharedFixtureCase(fn: fn, name: caseName, input: input, expected: expected))
        }
        let tolerance = (root["tolerance"] as? NSNumber)?.doubleValue ?? 1e-9
        return SharedFixtureFile(tolerance: tolerance, cases: cases)
    }

    /// Mismatches between `actual` and `expected`: numbers within `tolerance`, objects on the
    /// keys `expected` names (an absent actual key equals an expected null), arrays element by element.
    static func diff(_ actual: Any?, _ expected: Any, tolerance: Double, path: String = "") -> [String] {
        if expected is NSNull {
            return actual == nil || actual is NSNull ? [] : ["\(path): expected null, got \(String(describing: actual))"]
        }
        if let expectedObject = expected as? [String: Any] {
            guard let actualObject = actual as? [String: Any] else {
                return ["\(path): expected object, got \(String(describing: actual))"]
            }
            var problems: [String] = []
            for key in expectedObject.keys.sorted() {
                problems += diff(actualObject[key], expectedObject[key] ?? NSNull(), tolerance: tolerance, path: "\(path).\(key)")
            }
            return problems
        }
        if let expectedArray = expected as? [Any] {
            guard let actualArray = actual as? [Any], actualArray.count == expectedArray.count else {
                return ["\(path): expected array of \(expectedArray.count), got \(String(describing: actual))"]
            }
            var problems: [String] = []
            for (index, element) in expectedArray.enumerated() {
                problems += diff(actualArray[index], element, tolerance: tolerance, path: "\(path)[\(index)]")
            }
            return problems
        }
        if let expectedString = expected as? String {
            return (actual as? String) == expectedString ? [] : ["\(path): expected \"\(expectedString)\", got \(String(describing: actual))"]
        }
        if let expectedNumber = expected as? NSNumber {
            if CFGetTypeID(expectedNumber) == CFBooleanGetTypeID() {
                return (actual as? Bool) == expectedNumber.boolValue ? [] : ["\(path): expected \(expectedNumber.boolValue), got \(String(describing: actual))"]
            }
            guard let actualNumber = actual as? NSNumber, abs(actualNumber.doubleValue - expectedNumber.doubleValue) <= tolerance else {
                return ["\(path): expected \(expectedNumber), got \(String(describing: actual))"]
            }
            return []
        }
        return ["\(path): unsupported expected value \(expected)"]
    }

    /// Runs every case through `run` and returns the mismatches, one line each.
    static func check(_ file: String, run: (SharedFixtureCase) throws -> Any) throws -> [String] {
        let fixture = try load(file)
        var failures: [String] = []
        for fixtureCase in fixture.cases {
            do {
                let actual = try run(fixtureCase)
                failures += diff(actual, fixtureCase.expected, tolerance: fixture.tolerance, path: fixtureCase.label)
                    .map { "\(file) \($0)" }
            } catch {
                failures.append("\(file) \(fixtureCase.label): threw \(error)")
            }
        }
        return failures
    }

    static func orNull(_ value: Double?) -> Any {
        if let value { return value }
        return NSNull()
    }

    static func number(_ value: Any?) -> Double? {
        (value as? NSNumber)?.doubleValue
    }

    static func decode<T: Decodable>(_ type: T.Type, from object: Any) throws -> T {
        try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: object))
    }
}
