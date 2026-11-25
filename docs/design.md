# How Plate works

## From a meal to the dashboard

A typical entry starts with “a bowl of lentil soup and toast” or a photo. The ChatGPT handoff asks for a structured draft with a description and estimated kilojoules for each item. It can also include a meal time, macros and food-group energy allocations. A return link carries the draft in the URL fragment, not the query string. Plate parses and removes the fragment, then previews the entries before saving to the selected day. Pasting the reply and manual entry are alternatives.

The **demo** replaces this external handoff with a canned fictional draft, but uses the same review interface. The actual handoff depends on ChatGPT returning the expected shape; it isn't a nutrition database, and estimates are not measurements.

## What the dashboard is telling you

The macro bar reports energy consumed. A separate visual allowance helps plan for the remaining protein target; it's not a reservation inside the database. The daily plate groups food, while the three rings answer how much protein and fibre are logged and how much of the energy budget is left. Food-group slices represent allocated **energy**, not grams or serving sizes. Expanding food or opening a nutrient detail explains the aggregates without adding clutter to the main view.

Track Record uses a shared date axis for weight, stacked macro energy and targets. Weight is in kilograms; the energy bars use the selected unit. The dashed line on the bars shows the budget in effect on each day. Energy, protein and fibre trend percentages use their respective dated targets when available.

Macros and Targets can be turned on independently, and the browser remembers the view and date range after reloading. Tapping a plot shows the selected day's details for that section. Tapping any tile selects its whole date column and shows all three targets. Tapping a nutrient label hides or shows just that trend line, not its strip. Missing data stays missing. Today's bars and tiles are muted to show that the day is still in progress.

## The everyday screens

The screenshots use fictional data from the local demo. Open `/capture.html?shot=next-meal` for the midday example or `/capture.html?shot=high-energy` for the energy-sorted food log. The three Track Record views, `track-bulk`, `track-cut` and `track-fibre`, use the same log with different end dates and chart layers.

### Before deciding what to eat

![Energy budget and protein reserve](images/before.jpg)

### After a higher-energy day

![Expanded food log, with mini bars showing the energy and macro composition of each item](images/day.jpg)

### From bulk to cut

![Weight and daily energy at the end of the bulk](images/track-bulk.jpg)

![Weight and daily energy a few weeks into the cut](images/track-cut.jpg)

![Weight and nutrition targets later in the same cut, with fibre tiles turning green](images/targets.jpg)

The tile colours show how each day went against its targets. The lines show by how much. Today’s target values appear as hollow dots rather than a line from the last completed day. Missing dates have faint tiles, and the trend lines connect logged observations without adding data for those dates.

After onboarding, an inline tip appears the first time a user opens a day with at least two logged foods. It explains how to read the little bars and sort entries by tapping their energy or time. It doesn’t add another step to the first-meal flow.

## What changed in testing

Target setup already asks for a current weight. It now uses that value for one starting weight entry when the chart is empty, instead of asking again. The chart step confirms the recorded weight and points to + → Log weight for tomorrow. A separate muscle-building option starts at 1.6 g/kg/day for adults doing strength training. The energy unit changes how numbers are entered and shown, not the underlying amounts or the chart’s percentages.

## Architecture

```text
Description or photo → ChatGPT draft → browser review → explicit save
                                             │
Plate browser dashboard ─────────────────────┤
Site MCP logging tools ──────────────────────┤
                                             ▼
                                Worker validation and routes
                                             │
                               D1 records scoped by account

Portfolio demo: same UI → local fixture and in-memory mock API
```

- **UI:** plain HTML, CSS and JavaScript. Inline SVG draws charts and the plate; both share the app's selected date. The CSV parser lives in `weight-import.js`.
- **Worker:** `backend.js` validates requests and exposes same-origin browser routes and Sites MCP tools. The production identity header must be supplied by trusted hosting infrastructure; don't expose the Worker behind an endpoint that lets browsers supply their own identity header.
- **Storage:** SQL migrations define dated food and weight records, settings and effective-dated nutrition targets. The UI can display energy in kJ or kcal; the legacy storage field uses kcal. Food group allocations and CSV exports use kJ. Nutrient data and food-group energy allocations are different dimensions and can be absent independently.
- **Build and tests:** `build.mjs` packages the Worker, inlines the CSV parser and computes content-security-policy hashes. The source snapshot has no deployment credentials, managed project configuration, user logs or production starter-chat link. The local demo does not exercise managed sign-in or D1. The hosted app includes a standalone web-app manifest and icons; the local demo is for trying the interface. Its sample data and diary edits reset on reload. Chart view preferences can persist in the browser.
