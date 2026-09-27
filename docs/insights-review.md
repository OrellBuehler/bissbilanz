# Insights view review

Date: 2026-09-27

Reviewed revision: `35fd49ed`

## Recommendation

Bissbilanz already calculates many sophisticated metrics. The highest-value improvement is to make the existing information easier to trust, compare, and act on. Lead with **what changed, progress toward the user's goal, how much usable data supports the result, and one relevant next action**.

Prioritize consistent definitions and a short overview before adding more analytical cards. Keep the detailed Nutrition, Weight, and Sleep views for exploration.

This is a source-based product and analytics review, primarily of the web Insights route, with targeted Android and iOS comparisons. It is not a rendered-device accessibility audit or an analysis of real user records. Example numbers below are illustrative. Recommendations are product proposals, not nutritional prescriptions.

## What already works

- Nutrition, Weight, and Sleep provide understandable top-level categories.
- Summary tiles, collapsible sections, and pinning provide foundations for progressive disclosure and personalization.
- Existing analytics cover meal timing, protein distribution, weekday/weekend patterns, food diversity, nutrient adequacy, maintenance-calorie estimates, plateaus, forecasts, and food/sleep associations.
- Nutrient aggregation preserves unknown values and calculates coverage. The adequacy card already exposes unmeasured nutrients; NOVA calculations preserve an unknown share.
- Correlation code already provides confidence intervals, and nutrient screening applies multiple-comparison correction. Preserve these safeguards.
- Weight goals, target dates, nutrient contributors, water, activity, and detailed sleep fields already exist in the data model or supporting services.

The opportunity is largely in presentation, consistency, and connecting existing capabilities.

## Findings to address first

| Priority | Finding and evidence                                                                                                                                                                                                                                                                                                                                       | User impact                                                                                           | Recommended change                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | [Sleep summary](../src/lib/components/sleep/SleepTabContent.svelte) appends `/5` to the raw average; the [input](../src/lib/components/sleep/SleepLogForm.svelte) and [validation](../src/lib/server/validation/sleep.ts) use 1–10.                                                                                                                        | A valid average can appear as `7.0/5`.                                                                | Use the actual scale consistently; distinguish subjective ratings from imported device scores.                                                                   |
| P0       | [Web adherence](../src/lib/components/insights/GoalAdherence.svelte) defines strict success as `value >= goal` for every macro. [Android adherence](../mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/InsightsScreen.kt) uses `<=` for calories, carbs, and fat.                                                               | The same day can be a success on one platform and a failure on another.                               | Define shared goal semantics: minimum, maximum, or target range. Show those words instead of ambiguous “strict” and “tolerant.”                                  |
| P0       | The [web headline](<../src/routes/(app)/insights/+page.svelte>) compares calories against the base goal. The detailed adherence card applies daily activity adjustments.                                                                                                                                                                                   | Headline and detail can disagree even for the same seven days.                                        | Reuse one calculation, daily effective goal, and denominator across summaries, charts, calendars, and clients.                                                   |
| P1       | Nutrition summary uses seven days; meal distribution defaults to today; other cards independently use 30, 60, or 90 days. Sleep summary averages all locally loaded entries. See [route](<../src/routes/(app)/insights/+page.svelte>), [sources](../src/lib/insights/sources.ts), and [sleep content](../src/lib/components/sleep/SleepTabContent.svelte). | Adjacent numbers look comparable without describing the same period.                                  | Add a shared range and explicit dates. Clearly label longer analytical windows when a model requires them.                                                       |
| P1       | [Summary and utility logic](../src/lib/utils/insights.ts) treat `calories > 0` as a logged day. Today's partial log is included in the initial seven-day window.                                                                                                                                                                                           | A single snack can count as a full observation; a partial day can lower an average or adherence rate. | Say “days with entries” now. Add explicit day-completion status later. Default historical comparisons to completed calendar days, with today separately labeled. |
| P1       | [InsightCard](../src/lib/components/analytics/InsightCard.svelte) assumes insufficient data means `7 - sampleSize` more days. [TDEE](../src/lib/analytics/tdee.ts) actually requires both weight and calorie observations; [food diversity](../src/lib/analytics/food-diversity.ts) assesses weeks while returning entry count as sample size.             | “0 more days” can coexist with an unavailable result; entries can be described as days.               | Return metric-specific eligibility and units: missing weigh-ins, matched nights, observed weeks, or unavailable nutrients.                                       |
| P1       | [AnalyticsGroupSection](../src/lib/components/insights/AnalyticsGroupSection.svelte) swallows loading errors; [source loaders](../src/lib/insights/sources.ts) commonly return empty arrays when response data is absent.                                                                                                                                  | Service failures can look like insufficient logging.                                                  | Separate unavailable, offline/stale, empty, and insufficient-data states; retain usable cached results and offer retry.                                          |
| P1       | Headline weight rate uses the endpoints of moving averages; [TDEE](../src/lib/analytics/tdee.ts) uses regression over measured weights in its own window. The [forecast card](../src/lib/components/analytics/WeightForecastCard.svelte) combines a decelerating projection with a linear target-date calculation.                                         | Rates and target dates can appear inconsistent.                                                       | Standardize the headline method and window; derive target arrival from the same forecast model or clearly label the differing assumptions.                       |
| P1       | Forecast color treats loss as green and gain as red; the [micronutrient correlation card](../src/lib/components/analytics/MicronutrientGapsCard.svelte) similarly colors negative weight associations green.                                                                                                                                               | The display assumes weight loss is always the goal.                                                   | Use neutral directional colors unless an explicit goal makes a result favorable. Maintenance and gain should be first-class cases.                               |

P0 means fix before expanding the feature; P1 means high-value next work. These are product priorities, not incident severity ratings.

## Information architecture

Three plausible approaches:

| Approach                                              | Benefit                                                  | Tradeoff                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Polish the current card collection                    | Smallest change; familiar navigation                     | Users still assemble the story themselves                                              |
| **Add a concise overview above the existing details** | Makes progress and changes visible while retaining depth | Requires ranking and shared metric definitions                                         |
| Build a conversational coaching feed                  | Can explain context in natural language                  | Greater complexity, harder reproducibility, and more opportunity to overstate evidence |

Recommend the second approach. A deterministic overview is sufficient; generating narrative with AI is not necessary.

Suggested layout:

```text
Insights                          Last 28 days ▾
Aug 30–Sep 26 · compared with preceding 28 days
Food: 23 days with entries · Weight: 12 days · Sleep: 21 nights

YOUR OVERVIEW
Goal progress       Protein target       Fiber target
Current + change    Days meeting goal    Typical shortfall

WHAT CHANGED
Up to three findings, each with evidence and a next action

Nutrition | Weight | Sleep
Primary trend → goal comparison → contributors → explore patterns

Advanced analysis ▸       Data and calculation details ▸
```

Use 28 days as a proposed default for comparison because it contains four full weekday cycles; offer 7, 28, 90 days and custom dates. This is a design choice to validate with users. Do not force a model with insufficient observations to produce a result just because its range is selected.

Rank overview findings by relevance to the user's goal, usable coverage, meaningful change, and whether there is a useful action. Avoid multiple cards repeating the same signal. Show stable progress as well as problems. Let users dismiss a finding or pin a metric using the existing pin mechanism.

## Metrics worth surfacing or adding

| Metric                                  | Definition and question answered                                                                                                 | Data readiness                                                           | Suggested display                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| **Period-over-period change**           | Current average minus preceding equal-length period: calories, protein, fiber, sleep duration, and weight trend. What changed?   | Existing records; needs comparison logic and coverage rules              | Current value, signed change, dates, and observation counts                              |
| **Days meeting each selected goal**     | Eligible days satisfying that day's minimum, maximum, or range divided by eligible days. How consistently am I meeting my goals? | Existing intake and current goals; historical goals/completion need work | `Protein: 18/23 days`, with five below-target days selectable                            |
| **Typical shortfall on missed days**    | Median `max(goal - intake, 0)` among eligible days below a minimum target. How large is the gap when I miss?                     | Existing intake; better with confirmed complete days                     | `On missed days: typically 12 g below your fiber goal`                                   |
| **Intake variability**                  | Median and interquartile range across eligible days. Is the average hiding very different days?                                  | Existing data                                                            | Compact distribution next to mean, plus optional weekday breakdown                       |
| **Goal-relative weight progress**       | Observed trend, distance to target, and direction relative to the user's goal. Am I progressing as intended?                     | Goal/projection machinery already exists                                 | Promote into the weight header; show last weigh-in date and trend window                 |
| **Logging and nutrient coverage**       | Calendar-day coverage separately from each nutrient's known share of logged food. How much can I trust this result?              | Logged dates and nutrient coverage exist; confirmed completeness is new  | `23/28 days with entries`; `calcium known for 64% of logged calories`                    |
| **Nutrient contributors**               | Amount and percentage supplied by each food/recipe. Which foods account for this result?                                         | Nutrient-gap response already includes `topContributors`                 | Expand a nutrient to reveal ranked contributors and serving amounts                      |
| **Sources of change**                   | Change in per-day nutrient contribution by food or meal between comparable periods. Where did the change occur?                  | Entry-level data exists; new aggregation                                 | Ranked signed bars with an “other foods” remainder; describe contribution, not causation |
| **Sleep timing consistency**            | Variation in bedtime and wake time; compare workdays and free days where known. Is my schedule shifting?                         | Bedtime/wake time exist but may be sparse                                | Time-of-night dot plot with median and spread; handle midnight correctly                 |
| **Water logging and target attainment** | Average recorded water on observed days; days meeting a configured goal. What do my water logs show?                             | `waterMl` and water goal already exist                                   | Optional small card; missing water logs remain unknown                                   |
| **Action follow-through**               | User chooses one change, records its start, and reviews the relevant metric later. Did the chosen behavior change?               | Requires lightweight new state                                           | One selected action with a review date; do not claim causal health effects               |

For all comparisons, show counts for both periods. If logging coverage differs substantially, qualify or suppress the directional takeaway. Missing days must not silently become zero intake. A comparison between two logged-day averages describes those observations, not necessarily the user's entire diet.

Do not add another general nutrition score initially. A composite score conceals which target changed and how missing data was handled. Likewise, avoid duplicating existing TDEE, forecast, diversity, or caffeine cards under new names.

## Missing information and collection priorities

### High-value additions

1. **Day status:** distinguish no entries, partial, user-marked complete, and intentional fasting. Preserve the distinction between a complete log and proof of accurate intake. Existing fasting flags/sessions can help but are not a substitute for completion state.
2. **Effective-dated goals:** the reviewed Insights loader applies the currently retrieved goals to the whole range. Store goal changes and activity-credit settings with effective dates so historical adherence remains interpretable.
3. **Metric provenance:** expose observation window, eligible/omitted counts, last refresh, source, units, method, and reason for exclusion. Activity and sleep source fields already provide part of this.
4. **User priority:** explicitly choose weight loss, maintenance, gain, nutrient consistency, or sleep. A target weight alone cannot express every user's reason for opening Insights.

### Existing information to connect better

- The nutrient-gap API already returns coverage, reference type/source, shortfall, and contributors. The current adequacy card renders only part of this. Expose these fields before adding another nutrient endpoint.
- The reviewed nutrient-gap query reads food entries and recipe nutrients, not supplement-log tables. Label the result's scope explicitly. Audit whether supplements are also entered as foods before adding separate supplement totals, to prevent double counting.
- Day notes, activity notes, sleep source, latency, awakenings, and stage durations exist. Use relevant notes as optional timeline annotations. Keep sleep sources distinguishable rather than assuming their scores are interchangeable.
- Water and activity can be useful optional context, without turning Insights into a fourth full dashboard.

### Optional later collection

Structured tags for illness, travel, schedule changes, training, hunger, or energy could explain unusual periods. Add only a few opt-in tags with a clear use. Do not require more sensitive data or daily questionnaires merely to populate more charts.

Food diversity currently counts food IDs, recipe IDs, or names. That is **logged-item variety**, not necessarily ingredient or food-group diversity. A true plant/food-group metric would require a reliable taxonomy, recipe expansion, and deduplication; renaming the existing count would be misleading.

## Display changes

| Current pattern                                          | Proposed display                                                                                               | Why                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Macro radar                                              | Horizontal bullet bars: actual amount, target, and difference                                                  | Easier to compare individual nutrients; avoids a capped polygon obscuring magnitude  |
| Meal distribution donut and totals                       | Ranked meal bars with both share and average per observed day                                                  | Supports comparison and clarifies whether numbers are period totals or daily amounts |
| Two adherence percentages per nutrient                   | One plain-language goal rule plus counts below/in/above its range                                              | Removes ambiguous success definitions                                                |
| Long stack of analytical cards                           | Three overview findings, primary trends, then expandable detail                                                | Reduces the work needed to identify what matters                                     |
| Weight logging form and history before analytical groups | Trend and goal context first; compact “Log weight” action and expandable history                               | Keeps interpretation prominent while retaining convenient entry                      |
| Correlation coefficient as a main result                 | Plain-language association, matched observation count, practical difference where valid; statistics in details | Helps users understand the finding without implying cause                            |
| Nutrient rows with dense small text                      | Short prioritized list, expandable contributors and coverage, “view all”                                       | Makes important gaps readable without hiding unknown nutrients                       |
| Uniform missing-data message                             | Exact missing input plus a relevant link                                                                       | Turns an unavailable result into a clear next step                                   |

Keep the calendar as a drill-down tool. Distinguish unknown, partial, fasting, below-range, and above-range states with labels or patterns as well as color. A tap should open the relevant diary day.

For accessibility, include a textual chart summary and a table/list alternative; support keyboard and touch access to details; avoid relying on hover or red/green alone. Review the many 10–11 px labels and truncated nutrient names on actual devices before finalizing spacing.

## Make each insight explain itself

Use a consistent structure:

1. **Observation:** “Your average logged fiber increased by 4 g/day.”
2. **Context:** “Compared with the previous 28 days; both periods include 23 days with entries.”
3. **Evidence:** show the trend, eligible counts, missingness, and method.
4. **Action:** “See which meals contributed” or “Review days below your goal.”

Keep observations, model estimates, and exploratory associations visibly distinct. The shared confidence helper is largely sample-count based; a larger sample does not automatically mean a more trustworthy personal conclusion. Rename count-based badges to describe data quantity, while explaining uncertainty separately.

Preserve the existing confidence intervals and multiple-testing adjustments. For promoted associations, also assess coverage, time alignment, stability across periods, and plausible confounding. “No clear association” is a valid outcome. Do not suggest dietary changes solely because a nutrient correlates with next-day weight.

For TDEE and forecasts, show the assumptions and quality of the input record. Add an uncertainty range only after implementing and validating an uncertainty model; a decorative band or arbitrary percentage would imply unsupported precision. Personalized weight planning depends on diet, activity, and the time horizon, as illustrated by the [NIDDK Body Weight Planner](https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner).

For nutrient adequacy, keep reference type and intended population visible. RDA, AI, and upper limits have different meanings; a percentage below a reference should not be presented as a diagnosed deficiency. [NIH Office of Dietary Supplements reference definitions](https://ods.od.nih.gov/HealthInformation/nutrientrecommendations/) support preserving these distinctions. Existing reference-aware logic should remain authoritative.

## Delivery sequence and acceptance criteria

### 1. Restore consistency

Fix sleep scale, goal semantics, activity adjustments, sample units, and error states. Agree on metric definitions across TypeScript, Kotlin, and Swift presentation.

Acceptance: identical fixtures produce identical goal outcomes on every client; a score of 8 displays as `8/10`; unavailable data identifies the actual missing input; a failed request never asks the user to log more days.

### 2. Add shared context and comparisons

Introduce a shared date range, visible comparison period, coverage row, previous-period changes, and one documented weight-rate method. Label longer model windows explicitly.

Acceptance: every headline identifies its period and denominator; changing range updates dependent summaries; unlogged days and today's partial log cannot masquerade as complete observations.

### 3. Improve usefulness with existing data

Add the short overview, goal-specific counts and shortfalls, contributor drill-downs, and clearer bar charts. Promote weight goal context and simplify access to logging/history.

Acceptance: a user can identify one meaningful change, explain the supporting data, and reach the relevant diary or contributor detail without scanning all analytical cards.

### 4. Add only validated new tracking

Introduce completion status and goal history first. Trial sleep consistency, optional water summaries, and action review after checking data availability and user interest.

Validate with sparse logs, complete logs, fasting, changed goals, gain/maintenance goals, mixed sleep sources, time-zone boundaries, and offline records. Extend existing analytics parity fixtures where semantics change. Test the redesigned view with representative users; measure whether they correctly understand the metric and find a useful next step, rather than rewarding time spent scrolling.

No application behavior was changed as part of this review.
