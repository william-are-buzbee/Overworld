# Material Textures — how each material covers a tile

How each material distributes across a tile at sprite scale, and the growth forms of the mixotrophic flora. Moved out of the
old three-layer colour document (30 Sep 2026) when colour became spectral: a material's colour is now computed from what it is
made of (`Notes/Spectral-Color-Design.md`, `js/spectra.js`); its spatial pattern is described here.

---

## Material Texture Profiles

How each material distributes visually across a tile surface at 16×16 pixel scale. Each profile describes the spatial pattern, density, and character of that material's visible features. These are the specs for procedural texture generation and for hand-authoring sprites that correctly represent material composition.

In the current sprite system, '.' = bg (tile fill), '#' = fg (primary detail), '-' = mid (secondary detail). The texture profile describes what each of these pixel types represents physically for each material, and how densely they distribute.

### Photosynthetic Flora Textures

**`photosynthetic_tissue` (living mat/frond)**
Pattern: mat-forming. Continuous coverage with irregular gaps where the mat is damaged, thin, or hasn't filled in. At low coverage (grassland), scattered patches and short filaments — 2-3px clusters separated by gaps. At high coverage (forest canopy), near-solid with occasional 1px gaps where substrate shows through. The key character: organic continuity — patches connect to each other, not isolated dots. Edges are soft and irregular, not geometric. At canopy scale (cover tile), reads as the crown of a branching fern-tree — a dome-shaped mass with fractal frond subdivisions visible as internal detail.

**`dead_organic` (detritus)**
Pattern: scattered fragments. No continuous structure. Random 1px dots and 1-2px dashes distributed with no directional bias. Denser near living mat zones (decomposition happens where things grew), sparser on exposed substrate. The key character: scatter without pattern — looks like debris because it is. No clusters, no alignment, no growth structure. Just random organic litter on the ground.

**`structural_wood` (trunk/stalk material)**
Pattern: vertical, linear, narrow. A trunk is 2-3px wide at 16×16 scale. Internal detail is vertical grain — 1px '-' marks running parallel to the trunk axis, representing mineral banding in the impregnated ceramic-like material. No branching at ground level (branching happens at canopy height). The key character: rigid vertical axis — unlike the organic sprawl of mat tissue, trunks are straight structural columns.

### Chemotrophic Flora Textures

These look geological, not botanical. Growth forms are dictated by mineral substrate contact, not light capture.

**`chemotrophic_mat` (mineral crust)**
Pattern: near-uniform with concentric growth features. Covers surfaces as a continuous crust, more homogeneous than photosynthetic mat (no gaps for substrate to show through — the crust IS on the substrate). Visible features are concentric arcs radiating from growth centers, and occasional ridge lines where two spreading mats meet. At 16×16, the fg pixels form subtle arc fragments and ridges across a mostly-solid bg fill. The key character: geological uniformity with growth lines — more like lichen crust or mineral deposit than a living mat. Slightly glossy (higher reflectance detail) when wet.

**`chemotrophic_colony` (mound/bracket body)**
Pattern: horizontal banding. The growth layers of a colony mound are visible as concentric horizontal lines — each layer a ring of mineral-encrusted organic material deposited over time. At 16×16, a mound silhouette is a wide dome (8-12px wide, 5-8px tall) in the lower portion of the tile, with 2-3 horizontal '-' lines across its body showing growth rings. A bracket shelf is similar but horizontal — a flat projection from a vertical surface, 4-8px wide and 1-2px tall, with a single growth line. The key character: layered, architectural, wider than tall. Colony structures look built, not grown. More termite-mound than mushroom.

**`chemotrophic_spire` (reproductive stalk)**
Pattern: thin vertical. 1px wide, 6-8px tall, projecting upward from a mound or mat surface. May have a 2px bulb at the top (spore release structure). Sparse — at most 1-2 per tile, and only on tiles representing mature colonies. The key character: needle-thin vertical accent against the horizontal banding of the colony body. The only chemotrophic growth form with significant vertical extent.

### Mixotrophic Flora Textures

**`mixotrophic_tissue` (dual-energy organisms)**
Pattern: low mound base with filamentous crown. The base is chemotrophic-style — a low dome (4-6px wide, 3-4px tall) with horizontal growth banding. The crown is photosynthetic-style — 2-4px of irregular organic filament/frond texture rising from the top of the mound. The two textures stack vertically with a visible transition. At 16×16, this reads as a small dome with a fuzzy red top. The key character: geological base, botanical crown. The only organism on the planet that looks half-rock, half-plant.

### Mineral and Geological Textures

**`mineral_substrate` (soil)**
Pattern: mostly uniform with sparse inclusions. Soil is fine-grained at the tile scale — the bg fill dominates. fg pixels are rare — occasional pebble-scale inclusions (1px dots, very sparse, 2-4 per tile). The key character: ground. Uninteresting. The substrate is what shows between the interesting things growing on it.

**`bedrock` (exposed solid stone)**
Pattern: irregular slab edges and crack lines. Blocky features — 2-3px rectangular fg clusters representing raised stone slabs, with 1px '-' marks representing fractures and grain boundaries between them. More dense and angular than soil. The key character: hard, fractured, geometric. Stone has visible structure because it breaks along crystal planes and bedding surfaces.

**`granular_mineral` (sand/gravel)**
Pattern: nearly homogeneous fine grain. At 16×16, sand is almost solid bg fill with extremely sparse fg dots (1-2 per tile). Gravel is slightly denser (3-5 fg dots). The key character: uniformity. Sand looks like sand because every grain is the same size and nothing interrupts the surface. The most visually monotone material — variety comes from chemistry tint, not texture.

### Water Textures

**`liquid_water` (water body)**
Pattern: directional wave marks. fg pixels form 2-3px dashes oriented roughly parallel to each other (wave crests), distributed with regular spacing (4-5px apart vertically). At 16×16, 3-4 wave mark dashes per tile. The key character: directional rhythm. Wave marks are NOT random scatter — they follow surface tension and wind patterns. They should have consistent orientation within a region. Calm water has fewer, fainter marks. Rough water has more, brighter marks.

**`wet_film` (water on surface)**
Not a standalone texture. Modifies the underlying material: reduces the number of visible fg/mid pixels by ~30% (water fills micro-gaps, reducing surface detail) and its colour follows from wetting (Spectral-Color-Design: water in the pores cuts scattering, so darker and more saturated). Wet versions of any material look smoother and darker than dry versions.

### Animal Tissue Textures (for corpse/body rendering)

**`hemolymph` (blood/fluid)**
Pattern: pooling. On a corpse or wound, hemolymph gathers in low spots — fills the bottom of the tile or pools in irregular 3-5px blobs. The key character: liquid accumulation. Not scattered dots — pooling fluid that flows to the lowest point.

**`calcium_structure` (bone)**
Pattern: linear exposed edges. Bone shows through as curved lines on a corpse — 1-2px wide arcs where the flesh has parted and the underlying structure is visible. Not scattered dots — continuous structural elements partially revealed.

---

## Mixotrophic Flora — Design Concept

### What They Are

Dual-energy organisms that process both light (photosynthesis) and minerals (chemotrophy). Descended from chemotrophic lineage ancestors that acquired photosynthetic capability through endosymbiosis or horizontal gene transfer from the photosynthetic microbial lineage. Both flora lineages share the same deep ancestral microbial base — the genetic distance for pathway transfer is small enough that mixotrophy is a plausible and likely evolutionary outcome.

### Where They Grow

Transition zones where both light and mineral substrate are available. The boundary between photosynthetic forest and chemotrophic zone is their primary niche. Also: around surface mineral seeps within forested areas, along mineral-rich stream banks, on exposed rock faces in partial canopy, colonizing the bases of photosynthetic tree trunks where mineral substrate meets bark. They are the ecotone organisms — the "weeds" that fill every zone where at least one energy source is present.

### Why They Matter Visually

They produce colors that don't exist in either parent lineage. Photosynthetic crimson mixed with manganese violet = red-purple. Crimson mixed with copper teal = dark mauve. Crimson mixed with iron amber = deep warm red. These hybrid colors break up the hard visual boundary between forest (red) and fungal zone (purple), creating natural gradation. They also provide visual variety within forests near mineral sources — patches of differently-colored growth that signal "mineral chemistry is different here" without requiring a full biome transition.

### Growth Form

Low mound base (chemotrophic-style, 4-6px wide, 3-4px tall, horizontal growth banding) with photosynthetic filaments or frond-like extensions rising from the top (2-4px of irregular organic texture). The base is mineral-tinted by local chemistry. The crown is red-violet (photosynthetic pigment). The transition between the two materials is visible. At 16×16 tile scale, reads as a small dome with a fuzzy red top — clearly distinct from both tree silhouettes and pure colony mounds.

### Implementation Status

Not yet implemented. When implemented, mixotrophic growth would be:
- A new ground type or ground modifier for transition zones
- Chemistry-variable coloring (base tint from local minerals, crown always red-spectrum)
- Appearing in BIOME_PROFILES as a groundPalette component in ecotone zones
- Potentially a new cover type for dense mixotrophic growth

---

## Notes

**Water texture note.** Water's colour is computed (the water column over its bottom, Spectral-Color-Design). If the water TILE TEXTURE (sprite pattern) looks wrong with the computed colours, the texture is redesigned — the colour is not bent to fit the texture.

**Chemotrophic sprite redesign needed.** The current mushroom/mushforest sprites are reskinned tree silhouettes. Chemotrophic organisms are not tree-shaped. They are mounds, brackets, mats, and spires — geological forms, not botanical ones. New sprites should be designed from the texture profiles in this document. This is a sprite design task, not a palette task.

**Material texture profiles are forward-compatible.** The texture profiles describe spatial distribution behavior per material, independent of resolution. They apply to 16×16, 32×32, or procedurally generated tiles at any scale. The same profile ("concentric growth arcs, ridge lines where mats meet") can be rendered as 2px arcs at 16×16 or as detailed mineral crust at 64×64. The profiles don't need to change when resolution changes — only the rendering code does.
