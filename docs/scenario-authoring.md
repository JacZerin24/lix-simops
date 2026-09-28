# Scenario authoring

Scenario packs are YAML-driven and should be reproducible.

## Required files

- `scenario.yaml`
- `event.yaml`
- `injects.yaml`
- `resources.yaml`

## Principles

1. Never expose future data to participants.
2. Use simulation time, not wall-clock time, for dataset availability.
3. Keep injects separate from meteorological datasets.
4. Store raw weather data outside git.
5. Make manual facilitator override possible for every automated inject.
6. Preserve an event log for the debrief.

The schema will evolve as radar and meso data providers are implemented.
