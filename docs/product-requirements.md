# MacroMap — MVP Product Requirements

## Product goal

MacroMap is a private, mobile-friendly application that manages weekly meal
planning from saved recipes through to cooking and grocery shopping.

It plans breakfast, lunch, and dinner for two people, balances each person's
daily macros, encourages variety while reusing ingredients, and prepares a
draft automatically every week.

## Household and nutrition

- One household account manages two people: Chris and Alex.
- Each person has individual daily targets for:
  - Kilocalories
  - Protein
  - Carbohydrates
  - Fat
- The application reserves 15% of each target for snacks, which it does not
  plan.
- On complete days, all planned meals are evaluated against the remaining 85%:
  - Calories target: approximately +/-10%
  - Protein: prioritise reaching the target
  - Carbohydrates and fat: approximately +/-15%
- Targets apply to each person's complete day, not individual meals.
- When both people attend a meal, they eat the same recipe but may receive
  different portions.
- Portions use quarter-serving increments.
- The planner prioritises sensible serving sizes over mathematically perfect
  macro matching.

## Attendance

- Every week begins with breakfast, lunch, and dinner slots for Monday through
  Sunday.
- Attendance can be changed separately for each person and meal.
- A meal with one attendee is scaled down to one person.
- A meal with no attendees remains unplanned.
- If someone is absent for a meal, the planner does not compensate by enlarging
  their other meals.
- That person's daily nutrition is labelled partial because the external meal's
  macros are unknown.

## Weekly planning

- A draft for the following Monday through Sunday is generated every Friday at
  17:00 in the `Europe/London` timezone.
- Generation accounts for GMT and British Summer Time automatically.
- Only one draft is created for a given week, and it is never automatically
  approved.
- Plans use only recipes saved by the user. The planner must never invent
  recipes.
- If the library cannot satisfy every objective, the planner produces its best
  attempt and clearly explains the shortfalls.

Planner priorities, in order:

1. Sensible portions and cooking quantities
2. Proximity to daily macro targets
3. Dinner uniqueness
4. Flavour and cuisine variation
5. Avoidance of recently served recipes
6. Reuse of ingredients across the week

Repetition rules:

- Breakfasts and lunches may repeat.
- A normal seven-dinner week should contain at least five distinct dinner
  recipes.
- No dinner should normally appear more than twice.
- Dinners used during the previous two weeks receive a soft penalty but remain
  eligible.

## Recipe management

Recipes can be added through:

- A webpage URL
- Direct Schema.org `Recipe` JSON or JSON-LD
- Manual entry

URL imports first look for valid Schema.org recipe data. If it is missing or
unusable, the application attempts AI-assisted extraction.

Every import opens a mandatory review screen before saving. The user can
correct:

- Title and description
- Yield and serving count
- Structured ingredient names, quantities, and units
- Instructions
- Meal-type tags
- Nutrition
- Source attribution
- Photo
- Inferred descriptive attributes

Instructions are optional. A recipe without them can be saved, planned, and
shown in cooking mode with a clear placeholder until instructions are added.

Breakfast, lunch, and dinner eligibility must be explicitly tagged. Cuisine,
primary protein, and flavour attributes may be inferred automatically but
remain editable. These inferred attributes are used only as soft planning
signals.

Recipe photos are optional. Imported photos are copied into application
storage; recipes without a photo use a neutral placeholder. When an import
contains multiple photos, MacroMap keeps only its primary photo.

## Nutrition estimation

- Manually confirmed nutrition takes precedence.
- Valid imported nutrition is retained.
- When nutrition is missing, it is estimated from structured ingredients using
  a nutrition data source.
- Estimated values show their source and confidence.
- Unrecognised or ambiguous ingredients are flagged for review.
- A recipe without a usable yield or ingredient quantities is excluded from
  automatic planning until corrected.
- A structurally complete recipe with low-confidence nutrition may still be
  planned, but displays a warning.
- Editing ingredients triggers nutrition re-estimation unless the user has
  supplied authoritative values.

## Practical quantities

- Individual portions are allocated in quarter-serving increments.
- The combined quantity for all attendees determines the batch being cooked.
- The whole recipe is scaled proportionally.
- Weights and volumes are displayed at sensible cooking precision rather than
  excessive mathematical precision.
- Grocery calculations and macro estimates reflect the final planned batch.
- Grocery quantities remain package-agnostic; the human decides which package
  sizes to purchase.

## Draft review and revisions

The weekly draft supports both:

- Direct controls for attendance, portions, and recipe replacement
- A free-text conversational interface

Instructions such as "less chicken this week" apply only to that week and do
not become permanent preferences.

When processing a change, the planner:

1. Applies the explicitly requested change.
2. Leaves all other meals unchanged if macro tolerances remain acceptable.
3. Adjusts serving sizes if necessary.
4. Makes the smallest possible number of additional substitutions only when
   required.
5. Clearly reports any consequential changes.

Meals do not need locking. Once a week is active, past meals are frozen while
today's and future meals remain editable.

Drafts use the latest recipe data. Approval snapshots recipe instructions,
nutrition, and quantities so later library edits cannot silently alter the
active plan or grocery list. Subsequent plan revisions create updated snapshots
only for affected meals.

## Grocery list

- A provisional grocery list appears alongside the draft.
- It updates as the plan changes.
- On approval, it becomes the active grocery list for the week.
- It includes every required ingredient because pantry contents are not
  tracked.
- Equivalent ingredients and compatible units are consolidated where reliably
  possible.
- Quantities reflect exact recipe requirements rather than retailer package
  sizes.
- Items can be checked, added, edited, or removed.

Simple recalculation rules:

- Generated requirements update when the plan changes.
- User-added items remain.
- User quantity overrides and deletions remain effective for that week.
- Matching items retain their checked state.
- The list represents current requirements only; it does not track surplus
  purchases or purchase history.

## Cooking mode

The mobile-friendly cooking view provides:

- The scaled combined recipe
- Each person's suggested serving
- A checkable ingredient list
- One instruction step at a time, or a clear placeholder when none exist
- An option to keep the screen awake
- The recipe photo or a neutral placeholder

Integrated timers and offline operation are not required.

## History

- Previous weekly plans are retained.
- Dinner history from the preceding two weeks informs recipe-selection scoring.
- Historical plans do not provide analytics, nutrition trends, or reporting in
  the MVP.

## Explicitly out of scope

- Planning snacks
- Micronutrients, fibre, or medical nutrition advice
- Allergy, intolerance, or dietary-safety validation
- Separate recipes for two people attending the same meal
- Multi-component meals such as separately planned mains and sides
- Deliberate leftovers, batch-cooking, or leftover inventory
- Pantry tracking
- Supermarket pricing, package optimisation, retailer integrations, or ordering
- Preparation-time optimisation
- Automatic weather awareness
- Persistent conversational preferences
- Meal locking
- Automatically sourcing or inventing recipes
- Native mobile applications
- Push notifications
- Offline cooking
- Integrated cooking timers
- Multiple households or separate household-member accounts
- Grocery surplus reconciliation or purchase history
- Nutrition and meal-plan analytics
