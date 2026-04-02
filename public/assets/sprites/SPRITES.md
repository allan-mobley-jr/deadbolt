# Sprite Atlas Guide

This directory accepts optional PNG+JSON texture atlas files that replace the programmatic (canvas-generated) sprites. Placing atlas files here is all that's needed — the sprite registry detects them automatically at boot and prioritises atlas frames over generated sprites.

## Atlas Files

| File | Contents | Sprite Keys |
|------|----------|-------------|
| `entities.png` + `entities.json` | Player, zombies, bullet | `player`, `zombie`, `zombie_runner`, `zombie_brute`, `zombie_horde`, `bullet` |
| `objects.png` + `objects.json` | Interactive world objects | `bookshelf`, `wooden_chair`, `table`, `sofa`, `bed`, `gas_can`, `car_battery`, `wire_spool`, `wooden_plank`, `metal_sheet`, `fridge`, `metal_shelving`, `cardboard_box`, `trash_can`, `tire` |
| `ui.png` + `ui.json` | 16×16 inventory icons | `ui_bookshelf`, `ui_wooden_chair`, `ui_table`, `ui_sofa`, `ui_bed`, `ui_gas_can`, `ui_car_battery`, `ui_wire_spool`, `ui_wooden_plank`, `ui_metal_sheet`, `ui_fridge`, `ui_metal_shelving`, `ui_cardboard_box`, `ui_trash_can`, `ui_tire` |

All three files are **optional**. Any combination works — you can provide only `entities.png`+`entities.json` and objects will continue using programmatic sprites.

## Format

**JSON Hash** (Phaser standard) — compatible with TexturePacker, Aseprite, and free-tex-packer.

```json
{
  "frames": {
    "zombie": {
      "frame": { "x": 0, "y": 0, "w": 20, "h": 20 },
      "sourceSize": { "w": 20, "h": 20 },
      "spriteSourceSize": { "x": 0, "y": 0, "w": 20, "h": 20 }
    },
    "zombie_runner": {
      "frame": { "x": 20, "y": 0, "w": 18, "h": 18 },
      "sourceSize": { "w": 18, "h": 18 },
      "spriteSourceSize": { "x": 0, "y": 0, "w": 18, "h": 18 }
    }
  },
  "meta": {
    "image": "entities.png",
    "format": "RGBA8888",
    "size": { "w": 512, "h": 512 }
  }
}
```

## Frame Naming Convention

Frame names in the JSON **must match the sprite key exactly**:

| Entity | Frame Name | Size | Notes |
|--------|-----------|------|-------|
| Player (south idle) | `player` | 24×24 | Default facing direction |
| Zombie (shambler) | `zombie` | 20×20 | |
| Zombie (runner) | `zombie_runner` | 18×18 | |
| Zombie (brute) | `zombie_brute` | 28×28 | |
| Zombie (horde) | `zombie_horde` | 12×12 | |
| Bullet | `bullet` | 6×6 | |

### Object Frame Names

| Object | Frame Name | Size |
|--------|-----------|------|
| Bookshelf | `bookshelf` | 32×32 |
| Wooden Chair | `wooden_chair` | 16×16 |
| Table | `table` | 16×16 |
| Sofa | `sofa` | 32×32 |
| Bed | `bed` | 32×32 |
| Gas Can | `gas_can` | 16×16 |
| Car Battery | `car_battery` | 16×16 |
| Wire Spool | `wire_spool` | 16×16 |
| Wooden Plank | `wooden_plank` | 16×16 |
| Metal Sheet | `metal_sheet` | 16×16 |
| Fridge | `fridge` | 32×32 |
| Metal Shelving | `metal_shelving` | 32×32 |
| Cardboard Box | `cardboard_box` | 16×16 |
| Trash Can | `trash_can` | 16×16 |
| Tire | `tire` | 16×16 |

## Size Constraints

- **Immovable objects** (bookshelf, sofa, bed, fridge, metal_shelving): **32×32** pixels
- **Movable objects**: **16×16** pixels
- **Player**: **24×24** pixels per direction frame
- **Zombies**: Match visual sizes above (20, 18, 28, or 12 px square)
- **UI icons**: Always **16×16** pixels

## Colour & Tinting

Sprites are tinted at runtime via `setTint()`:
- **Entity sprites** (player, zombies, bullet) should be drawn in **white/gray** — the palette tints them to the correct colour
- **Object sprites** can be drawn in their **final colours** if desired, since objects use category-based tints (furniture = brown, loot = gold, containers = gray, debris = dark gray)

If drawing white sprites for tinting: `white × tint colour = tint colour`. If drawing coloured sprites: set the object's `renderColor` to `0xffffff` in `object-defs.ts` to disable tinting.

## Partial Atlas Support

You can include only some frames in an atlas. Missing frames automatically fall back to programmatic generation. For example, an `entities.json` with only `"zombie"` and `"zombie_brute"` will use atlas art for those two and programmatic sprites for everything else.

## Tools

- [TexturePacker](https://www.codeandweb.com/texturepacker) — Export as "JSON Hash"
- [Aseprite](https://www.aseprite.org/) — File → Export Sprite Sheet → JSON Hash
- [free-tex-packer](https://free-tex-packer.com/) — Free online alternative
