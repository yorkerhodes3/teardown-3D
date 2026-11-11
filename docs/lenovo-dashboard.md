# Rack dashboard, BOM imports, and vendor branding

The [live demonstration](https://yorkerhodes3.github.io/teardown-3D/) is a JavaScript application, not a video player. Three.js draws the rack and parts in WebGL. Geometry, materials, perforation textures, and text badges are generated in code; HTML/CSS provides the console. Fonts and dependencies are bundled into a self-contained HTML file. The scene does not contain vendor CAD assemblies or image-logo downloads.

## Dashboard controls

Open **Rack dashboard** in the top-right corner. Click the heading again to collapse it. The panel scrolls on smaller displays, and the auto-tour stays paused while it is open.

- **Example rack BOM:** select a researched example and confirm to replace the current draft. Review and apply it just like an uploaded BOM. Export the result as a starting template for a proprietary order; the examples are illustrative, not verified or order-ready.
- **Show risk signals and red highlights:** hides or restores risk colors, callouts, inspect-card warnings, and the risk list together. Signals are retained and external tools can keep updating them while hidden. This is separate from the existing **RISK** overlay, which fades non-risky parts to focus on flagged ones.
- **Branding:** change the display title, subtitle, cabinet name, rack/server badge text, and badge background color. Server names/descriptions and GPU vendor text/part labels are also editable. Update all relevant names when rebranding; changing a badge does not rename existing catalog SKUs.
- **Teardown server:** choose a catalog SKU for each existing slot and change quantities (memory quantity is per CPU). Expand a slot's SKU details to edit its name, printed label, or maximum watts. Changes to a server configuration affect all rack nodes using it; changes to a SKU affect every occurrence of that SKU.
- **Apply BOM and reload:** validates the draft, saves it in this tab's session storage, and reloads the scene so geometry, layout, BOM rows, and power totals are recalculated together. This is not an instantaneous hot-swap. It resets camera/control state and reconnects URL-based risk sources; in-memory API signals must be sent again.
- **Export JSON:** downloads the validated draft, including unapplied edits, as `teardown-bom-v1.json`. Start with this file when preparing a different order.
- **Upload BOM:** validates a file and stages it in the editor. Nothing changes in the active scene until you apply it.
- **Reset to published BOM:** asks for confirmation, discards tab-local changes, and reloads the published default.

Edits are local to the browser tab and survive reloads in that tab. They do not modify repository files, publish a configuration, or affect other viewers. If browser storage is unavailable, the dashboard reports the error rather than claiming the change was saved. Invalid saved data opens the dashboard with a recovery message and the published default.

## Rack row and small screens

Select **View rack row** to see four side-by-side 3D cabinets. Click a cabinet or its named button to focus it; select stages or components to explode the focused rack. The row cabinets are simplified previews, while only the selected rack is rendered as the detailed teardown. Each cabinet has a separate tab-local BOM; switching racks reloads the detailed scene and restores that rack's last applied BOM. A newly applied import or preset belongs to the currently focused rack. Unsaved editor drafts are not carried between racks; switching prompts before discarding them. Risk signals are evaluated for the focused rack only; API-injected, in-memory signals need to be sent again after switching/reloading. URL-based risk feeds reconnect.

On narrow screens the desktop panels are replaced with a touch-friendly stage slider, previous/next buttons, fan and risk toggles, a component picker, and expandable inspection details. The dashboard and row selector remain available. On larger displays the desktop console and camera/inspection controls are retained.

## Illustrative rack presets

The dashboard includes four complete `teardown-bom` v1 JSON files in [`sims/lenovo-shared/presets/`](../sims/lenovo-shared/presets/). Each contains a 42U example cabinet, two leaf switches, management switch, four GPU servers, one illustrative storage server, PDUs, rails, and a detailed target server with CPUs, memory, GPUs, drives, fans, PSUs and network cards. The server form factor and broad capabilities are based on the manufacturer references below; actual components, rack layout, PSU selection, rack dimensions, per-part sizes, power, and geometry are examples. CPU/GPU names in these examples denote families or generic placeholders unless an individual SKU is cited, and do not establish an approved configuration. Confirm every combination, power budget, and mechanical fit with the vendor before ordering.

| Preset | Source-supported platform | Manufacturer source |
|---|---|---|
| Lenovo ThinkSystem SR675 V3 | 3U, dual AMD EPYC 9004/9005, up to 24 DIMMs and PCIe GPUs | [Lenovo technical specifications](https://pubs.lenovo.com/sr675-v3/server_specifications_technical) |
| Dell PowerEdge R760xa | 2U, dual Intel Xeon Scalable, up to four double-width PCIe accelerators | [Dell R760xa specification sheet](https://www.delltechnologies.com/assetlink/doc/no-no/poweredge-r760xa-spec-sheet-en-dl1lrbv-original.pdf) |
| HPE ProLiant DL380a Gen11 | 2U, dual Intel Xeon Scalable, up to four double-width accelerators, six fans | [HPE DL380a Gen11 QuickSpecs](https://www.hpe.com/us/en/collaterals/collateral.a50004309enw.html) |
| Supermicro AS-4125GS-TNRT | 4U, dual AMD EPYC 9004/9005, up to eight double-width PCIe GPUs | [Supermicro product datasheet](https://www.supermicro.com/en/products/system/datasheet/as-4125gs-tnrt) |

The presets deliberately use generic component entries where an exact compatible order is not established, and the display uses the shared approximate PCIe-server model. The Supermicro example includes NVIDIA L40S accelerators, listed as supported by Supermicro; its 48 GB and 350 W ratings come from [NVIDIA's L40S specifications](https://www.nvidia.com/en-us/data-center/l40s/). Source limits do not prove that the illustrative combination of components is supported. Import a verified order BOM to replace these placeholders. The JSON files are regenerated from `presets/generate.mjs`; see the exported JSON and validation rules below for proprietary data conversion.

For the example PSU ratings, see [Dell's 2800 W PSU compatibility listing](https://www.dell.com/en-ie/shop/dell-single-hot-plug-power-supply-2800-watt-mm-hlac-200-240vac-titanium-by-liteon/apd/450-algt/computer-chassis-components) and [HPE's DL380a power-supply specifications](https://cdn.support.hpe.com/hpesc/public/docDisplay?docId=sd00002528en_us&page=GUID-3470BCE5-8F3D-4742-B1E0-15EDEB1AD7A4.html&docLocale=en_US). Ratings depend on input voltage and configuration; they are not proof that the example loads are supported.

The **FANS** overlay still controls visual rotor animation only, not a physical motor, thermal simulation, or the separately calculated fan power.

## Approved upload format

Only UTF-8 **`.json` files in `teardown-bom` version 1 format**, at most **256 KiB**, are accepted. Use **Export JSON** for a complete template. JavaScript, CSV, spreadsheets, CAD files, and arbitrary vendor JSON are not accepted; convert those to the documented format first. Files are parsed as data in the browser, never executed or uploaded by the dashboard.

The top-level object must contain these fields:

| Field | Contents |
|---|---|
| `format` | Exactly `"teardown-bom"` |
| `version` | Exactly `1` |
| `title` | `{name, sub, brand, badgeColor}`. `brand` is the text badge (1–24 characters); `badgeColor` is a six-digit hex color, such as `"#34373c"`. |
| `catalog` | Map of SKU ids to part definitions. Each has `kind`, `name`, `sub`, `dims: [width, height, depth]` in mm, and `spec: [[label, value], ...]`. Keep the kind-specific numeric fields from the exported template. GPU `vendor` and CPU/GPU `label` control printed labels. |
| `servers` | Map of configuration ids to server definitions: `name`, `sub`, `units`, `dims`, structure SKU references, and component slots. `shell: true` means a front-only, non-teardown server. |
| `rack` | `{part, pdu: {part, count}, rail, blank, layout}`. Layout entries are `{u, server, name, target}` or `{u, part, name}` for a switch. `u` is the lowest occupied rack unit. Exactly one detailed server has `target: true`. |

Supported catalog `kind` values: `rack`, `pdu`, `rail`, `blank`, `switch`, `chassis`, `cover`, `board`, `pcieboard`, `gpu`, `nvlink`, `drive`, `fan`, `fancage`, `cpu`, `socket`, `heatsink`, `dimm`, `duct`, `psu`, `riser`, `nic`, `ocp`, and `boot`.

Server slots use:

| Slot | Fields |
|---|---|
| `cpu` | `{part, count, socket?, heatsink?}` |
| `memory` | `{part, perCpu}` |
| `gpu` | `{part, count, bridge?, bridgesPerPair?}` |
| `drives`, `fans` | `{part, count}` |
| `psu` | `{part, count, redundancy?}`; redundancy is `"N"`, `"N+1"`, or `"N+N"` |
| `nics` | `{part, count, riser?}` |
| `ocp`, `boot` | `{part}` |

Structure fields are `chassis`, `cover`, `board`, `gpuBoard`, `duct`, and `fanCage`; each references the corresponding catalog kind. Detailed servers require a chassis, cover, at least one CPU, and enough PSUs for the specified redundancy. Optional slots can be removed in JSON; their quantities may also be zero. CPU/GPU/PSU/fan count limits are 4/16/8/16, respectively; other counts and memory per CPU are limited to 32. The format also caps catalog size (128), configurations (16), rack devices (48), dimensions (3000 mm), and geometry allocations to keep imported scenes bounded. The validator reports field-specific errors.

Unknown fields, missing references, wrong slot kinds, unsupported geometry kinds, malformed numbers, overlapping rack devices, and out-of-rack placements are rejected without replacing the prior draft or active scene. Other physical fit concerns can still produce layout warnings after applying; read them in the dashboard. Passing validation is **not** vendor certification, socket/protocol compatibility checking, an electrical safety check, or an exact mechanical fit guarantee. Keep spec rows and product names consistent with any numeric changes.

## Vendor flexibility

Branding is independent of the chassis/vendor configuration and the silicon vendor. For example, a Supermicro, Dell PowerEdge, HPE ProLiant, ASUS, or GIGABYTE system can contain AMD CPUs and NVIDIA accelerators. AMD is primarily a silicon/platform choice here; NVIDIA can also represent DGX/HGX or a reference platform, not simply a badge change.

| Change | Work needed |
|---|---|
| Display name, badge text/color, part names | Dashboard fields; apply and reload |
| Same-geometry SKU with different dimensions, specifications, or watts | Copy a catalog entry in exported JSON, change the data, and reference its new id |
| Quantities or a different target/rack layout | Dashboard for existing slot quantities; JSON for layout, new slots/SKUs, and target selection |
| Different mechanical architecture | New or adapted builders/layout logic in `rack.js` and `model.js`, plus visual review |

The current geometry depicts a rack-mounted PCIe GPU server. Renaming it does not make it an accurate model of an AMD Instinct OAM tray, an NVIDIA SXM/HGX baseboard, a blade chassis, or liquid-cooled plumbing. Those require additional geometry and layout rules, not just alternate logos. The dashboard deliberately does not pretend otherwise.

## Source and verification

`bom.js` defines the default configuration. `bom-format.mjs` validates imports; the live entry point restores a validated saved configuration **before** `model.js` computes the layout. `dashboard.js` owns the editor. The scripted tour remains in `film.js`; selections for absent optional parts are skipped.

```sh
node --test sims/lenovo-shared/bom-format.test.mjs
node --test sims/lenovo-shared/presets.test.mjs
node sims/build.mjs lenovo-live lenovo-film
CHROMIUM=/path/to/chrome node --test sims/lenovo-shared/dashboard.browser.test.mjs
CHROMIUM=/path/to/chrome node --test sims/lenovo-shared/row.browser.test.mjs
```

Omit `CHROMIUM` to use Playwright's installed browser. The browser test requires the live HTML to have been built first.
