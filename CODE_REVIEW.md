# Tenki Code Review (2025-12-21)

## High priority findings
- Uses `http` for the WeatherAPI call, leaking keys and allowing tampering. Switch to `https` in the request URL ([main.ts](main.ts#L201-L205)).
- Refresh interval is stored in seconds but presented/parsed as minutes, so the default `30` becomes 0.5 minutes in the UI and refreshes every 30 seconds instead of the documented 30 minutes ([main.ts](main.ts#L64-L69), [main.ts](main.ts#L553-L576), [README.md](README.md#L17-L20)).
- Multiple timers can run concurrently: `initView`, `onOpen`, and `refreshWeather` each schedule `setInterval` without canceling a prior one, and intervals are not registered with the plugin for automatic cleanup ([main.ts](main.ts#L119-L181), [main.ts](main.ts#L553-L576)).
- `clearUpdateInterval` relies on a truthy check and initializes `updateInterval` to `-1`; `clearInterval(-1)` is a no-op and leaves state ambiguous ([main.ts](main.ts#L144-L149), [main.ts](main.ts#L71-L75)).
- Commands call `this.view` directly without ensuring the view exists; invoking Refresh before the view is created will throw ([main.ts](main.ts#L94-L103)).

## Medium priority findings
- Location debounce is only 750 ms; users can overrun the rate limit while typing. The debounce also runs even when the value is empty ([main.ts](main.ts#L518-L533)).
- Network errors are only logged to the console; no user feedback or exponential backoff is provided ([main.ts](main.ts#L208-L218)).
- Air-quality rendering assumes `us-epa-index` is truthy; index `0` or missing values skip the label silently ([main.ts](main.ts#L307-L333)).
- The view instantiation logic in `initView` manually constructs `WeatherView` even though `setViewState` already uses the registered constructor; this risks double state and duplicated timers ([main.ts](main.ts#L119-L141)).

## Low priority/UI
- Forecast tooltip uses absolute positioning without offset; on narrow panes it can overflow. Consider `tippy.js` (already a dependency) for better placement.
- Emoji icons mix Unicode planes; stick to ASCII or an icon set to avoid font fallbacks.
- Styles use `display: column;` (invalid) on `.weather-container` ([styles.css](styles.css#L27-L32)).

## Suggested improvements
1) Interval & lifecycle
- Store `updateInterval` as `number | null`, use `this.registerInterval` to let Obsidian clean up, and centralize scheduling in one place (e.g., after `setViewState` and when the refresh interval changes). Guard `view` existence before calling `displayTemperature()`.

2) Debounce & settings
- Raise location debounce to 1500–2000 ms and ignore empty strings before fetching. Expose a setting if users want to tune it.
- Align the refresh interval units: store minutes (or seconds) consistently, update defaults/docs, and validate a reasonable minimum (WeatherAPI caps free tier to ~1k calls/day).

3) Networking robustness
- Switch to `https`, add a short timeout and better error handling (`Notice` on failure, retry with backoff, and surface the last successful update time). Abort inflight requests when scheduling a new refresh to avoid race conditions.

4) View management
- Let `setViewState` create the view and remove the manual `new WeatherView` branch. Use `getRightLeaf(true)` (or `getLeaf('split', 'tab')` on newer Obsidian) to auto-create the pane when absent.
- Use `registerEvent` for `onLayoutReady` and any future workspace listeners to ensure disposal.

5) UI/UX polish
- Add a loading/empty state when API key/location is missing. Disable the Refresh command/button until required settings exist.
- Label units explicitly (“Feels like: 23 °C”) and add tooltips for AQ values. Consider `Intl.DateTimeFormat` for locale-aware forecast labels.

6) Testing/typing
- Type the `requestUrl` response and handle non-200 statuses; WeatherAPI returns 4xx JSON with `error` fields. Add unit tests for the forecast extraction and AQ mapping logic.

## Quick wins to ship first
- Change the endpoint to `https`. 
- Unify refresh units (minutes) and raise the minimum to 30 minutes by default. 
- Centralize interval management with `registerInterval` and clear-before-set semantics. 
- Increase location debounce to ~1500 ms and skip fetches on empty input. 
- Show a `Notice` when fetch fails or when key/location is missing.