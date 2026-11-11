# PI Context

A PI-Desktop context-inspection plugin inspired by the workflow in [dsh-context](https://github.com/bowenliang123/dsh-context). The package ID remains `local.context-insights`; the display name is **PI Context**.

## Use

Open **PI Context / 上下文** from PI-Desktop's right work panel. If no snapshot exists, select **在聊天中检查**. It adds a one-line composer suggestion; accept it in the chat composer and send it to capture the current context. The command palette entry **PI Context: Open Panel** remains available.

## Available data

- Active-session estimated size and top-level composition.
- A category distribution, top context sections and searchable bounded previews.
- A trend of up to 32 snapshots captured by explicit inspection requests.
- Snapshot data is kept in plugin memory and cleared when the plugin unloads.

The tool reads `pi.session.getLlmContext()` only during its own active invocation. Token values use a Unicode-aware heuristic, not provider-reported accounting. The tool result returns counts only; previews stay in the view.

## Host integration

The visible entry is a native `contributes.views` item, following PI-Desktop's bundled Browser and File Manager plugins. The view uses the isolated-page bridge and follows the host's light/dark appearance and locale through `app.getAppearance`.

## Boundaries

This plugin does not claim cross-session usage, Fleet, persistent request history, file activity, command execution analytics or exact provider billing. Those datasets are not exposed to this plugin through the documented active-session context API. A faithful implementation of those views would require additional host APIs and appropriately scoped permissions.

## Permissions

- `ui.view` and `ui.panel` for the work-panel view and command fallback.
- `composer.suggest` for the user-triggered context inspection suggestion.
- `session.read` for context access during the plugin's Agent tool invocation.
- `agent.tool.register` and `agent.prompt.inject` for the inspection tool and routing skill.
