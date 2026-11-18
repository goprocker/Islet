# Making a built-in pet

A pet is a folder with a `pet.json` and one sprite sheet, in the Codex Pets format. `builtin-pets/doudou` is the one that ships today, and `src/pet-pack.js` is the code that checks and loads it. This page says what that code expects.

## Files

```
builtin-pets/<id>/
  pet.json
  sheet.webp      (or .png; any file name works, `pet.json` points at it)
```

`pet.json` for Doudou:

```json
{"id":"doudou","displayName":"Doudou","spritesheetPath":"sheet.webp"}
```

| Field | What Islet does with it |
|---|---|
| `id` | Lower-cased and reduced to `a-z`, `0-9` and `-` (at most 60 characters). Keep the folder name equal to this value: Islet looks the pet up by that folder name. |
| `displayName` | Shown in Settings; cut to 40 characters. If it is missing, `id` is used. |
| `spritesheetPath` | The sheet's file name. Only the file name is used, and the file must sit next to `pet.json`. It must end in `.webp` or `.png` and be 20 MB or smaller. |
| `spriteVersionNumber` | Optional. Write `2` for a v2 sheet; anything else, or leaving it out, means v1. |

## The sprite sheet

Frames are 192 x 208 px and the sheet has 8 columns, so it is 1536 px wide. The height must match the version exactly (Islet reads the size from the image header and refuses any other size):

| Version | Rows | Sheet size |
|---|---|---|
| v1 | 9 | 1536 x 1872 |
| v2 | 11 | 1536 x 2288 |

Rows are numbered from 0 at the top. Islet plays these rows, starting at the left-most frame, at 8 frames per second (`MOOD_ROW`, `ROWS` and `FPS` in `renderer/pet.js`):

| Row | Name | Frames played | Used for these moods |
|---|---|---|---|
| 0 | idle | 6 | idle, sleep, zen, sleepy |
| 3 | waving | 4 | alert, plant, hello |
| 4 | jumping | 5 | dance, love, happy, charge |
| 5 | failed | 8 | sick, cold |
| 6 | waiting | 6 | ask, hot |
| 7 | running | 6 | code, rush |
| 8 | review | 6 | work |

Rows 1 and 2 (and 9 and 10 in a v2 sheet) are never played, but they still have to be there so the sheet has the right size. The slow moods (sleep, sleepy, zen) play their row at 2 frames per second instead of 8. The README lists when the main moods apply.

The pet is drawn about 24 x 26 px with pixelated scaling (`.pet.custom` in `renderer/notch.css`), so check that it still reads at that size.

## Try it locally

1. Check the pack. From the repo root, this prints the pack, or throws a readable reason it was refused:

   ```powershell
   node -e "console.log(require('./src/pet-pack').readPack('builtin-pets/<id>'))"
   ```

2. Run `npm test`. `test/pet-pack.test.js` covers the size check, the import and the mood-to-row mapping.
3. Run `npm start`, open Settings, choose **Choose a pet...** and pick the pack's `pet.json` (or a `.zip` of the folder). Islet copies it into its own `pets` folder under its user data and uses it at once. The imported copy stays in `%APPDATA%\Islet\pets\<id>` and wins over a built-in pet with the same `id`, so delete that folder when you are done (**Use the cat** only stops using it).

## Making it ship

Everything under `builtin-pets/` is packaged (`build.files` in `package.json`), but nothing lists the folders. The Settings window has a button for Doudou only: `settings/settings.html` (`petDoudou`), `settings/settings.js` and `settings/preload.js` (`useDoudou`), which calls the `settings:useBuiltinPet` handler in `src/main.js` with the pet's `id`. A second built-in pet needs its own button wired the same way. Open an issue or a draft pull request first to agree how pets should be offered.

## Artwork

Only add artwork you made or that is licensed for redistribution, and say in the pull request where it comes from and under what licence. Pets downloaded from codex-pets.net have no license and many depict real people, so they are not a source for built-in pets.
