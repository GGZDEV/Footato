# Footato UI/UX redesign workflow

UI/UX Pro Max 2.15.0 is installed as a repository-scoped Codex skill under
`.agents/skills`. The installation also includes the companion `design-system`,
`ui-styling`, `brand`, `design`, `banner-design`, and `slides` skills.

Work on the redesign belongs on the `codex/ui-ux-pro-max-redesign` branch.

## Invoke the skill

Mention it explicitly in a Codex prompt:

```text
$ui-ux-pro-max

Audit the existing Footato UI without changing code. Treat it as a dense,
responsive football transfer analytics dashboard built with React and plain
CSS. Rank findings by user impact and cite the affected components/selectors.
```

Codex can also invoke it implicitly for UI work, but explicit invocation is
preferred during the redesign so the design rationale remains visible.

## Run the local search engine

The workstation does not expose a system `python` command. The wrapper below
uses Python from `PATH` when available and otherwise falls back to the Python
runtime bundled with Codex desktop:

```powershell
.\scripts\ui-ux-search.ps1 "data table accessibility" --domain ux
.\scripts\ui-ux-search.ps1 "responsive layout" --stack react
.\scripts\ui-ux-search.ps1 "football transfer data dashboard" `
  --design-system -p "Footato" --variance 4 --motion 2 --density 8 -f markdown
```

Do not persist a generated design system until its pattern, palette, and
typography have been reviewed against the actual product. A test run correctly
matched the `Data-Dense Dashboard` style but incorrectly proposed an
`Enterprise Gateway` landing pattern, so generated output is evidence to
evaluate rather than a specification to accept wholesale.

## Redesign loop

1. Capture the current UI at 375, 768, 1024, and 1440 px.
2. Run a read-only audit covering accessibility, touch targets, typography,
   responsive behavior, tables, charts, loading, empty, and error states.
3. Agree on the intended visual direction and persist a reviewed master design
   system only after that decision.
4. Implement one coherent surface at a time: shell/navigation, market view,
   filters/table, detail drawer, honours, then coverage.
5. After each surface, run type checks, the project tests, and browser checks at
   the four target widths.
6. Finish with keyboard, reduced-motion, contrast, overflow, and text-scaling
   verification.

Unless a redesign decision explicitly changes the stack, keep React, Vite, and
plain CSS and avoid introducing Tailwind or a component library solely because
a catalog example uses one.

## Implemented direction

The active branch now uses a **football data newsroom** direction: warm paper
surfaces, a deep ink masthead, electric blue for analysis controls, acid lime
for active navigation, condensed editorial headings, and tabular figures for
financial values. The market landing area combines scope, KPIs, and season
trends before the filterable ranking, while the same token system carries
through honours, completeness, and the mercato detail drawer.

The redesign lives in `src/redesign.css`, imported after the stable component
geometry in `src/styles.css`. This keeps the new art direction easy to review,
iterate, or remove without mixing it into the legacy style layer.
