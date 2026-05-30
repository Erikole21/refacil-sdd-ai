# Third-Party Notices

This project uses the following third-party packages. Each is used in accordance with its license terms.

---

## refacil-sdd-ai

### @colbymchenry/codegraph

- **Author**: Colby McHenry
- **License**: MIT
- **Repository**: https://github.com/colbymchenry/codegraph
- **Purpose**: Optional call-graph indexer integrated into refacil-sdd-ai to reduce token consumption
  in exploratory sub-agents (refacil-investigator, refacil-proposer, refacil-debugger) by querying
  the indexed call graph instead of reading source files directly (~71% estimated token reduction).
- **Usage**: Optional — the methodology works without it. Enable via `refacil-sdd-ai init` or set
  `codegraphMode: enabled` in `~/.refacil-sdd-ai/config.yaml`. Disable with:
  `refacil-sdd-ai sdd write-config --global --codegraph disabled`

### smol-toml

- **Author**: Florian Boulay and contributors
- **License**: MIT
- **Repository**: https://github.com/nicolo-ribaudo/smol-toml
- **Purpose**: TOML parser used for Codex agent frontmatter generation (`convertAgentToToml`).

### ws

- **Author**: Einar Otto Stangvik and contributors
- **License**: MIT
- **Repository**: https://github.com/websockets/ws
- **Purpose**: WebSocket library used by the local refacil-bus broker for cross-repo agent communication.

### @clack/prompts (optional)

- **Author**: Nate Moore and contributors
- **License**: MIT
- **Repository**: https://github.com/bombshell-dev/clack
- **Purpose**: Optional peer dependency for interactive CLI prompts during `refacil-sdd-ai init`.
  Falls back to a built-in readline implementation when absent.

---

All other dependencies included via transitive closure are subject to their respective licenses.
Refer to each package's `LICENSE` file or the npm registry for details.
