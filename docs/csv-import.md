# Importing foods from CSV

The food database page (`/foods`) can bulk-create foods from a CSV file. Pick
**Import CSV**, download the template if you want the exact column list this
build understands, fill it in, and drop it back in. The file is parsed in the
browser, so you see the row count and any errors before anything is written.

## Format

- UTF-8, one header row, one food per row.
- Comma, semicolon or tab separated — the delimiter is detected from the header.
- Quote a value with `"` if it contains the delimiter; `""` is a literal quote.
- Numbers may use either `.` or `,` as the decimal separator.
- An empty numeric cell means "not given"; the five macros then default to `0`.

### Required columns

| Column         | Meaning                                                                       |
| -------------- | ----------------------------------------------------------------------------- |
| `name`         | Food name. Must not be empty.                                                 |
| `serving_size` | Amount one serving represents. Must be greater than zero.                     |
| `serving_unit` | One of `g`, `kg`, `ml`, `cl`, `l`, `oz`, `lb`, `fl_oz`, `cup`, `tbsp`, `tsp`. |

### Optional columns

| Column                                         | Meaning                                       |
| ---------------------------------------------- | --------------------------------------------- |
| `brand`                                        | Manufacturer or store brand.                  |
| `calories`, `protein`, `carbs`, `fat`, `fiber` | Per serving. Default `0`.                     |
| `barcode`                                      | EAN/UPC. Must be unique within your database. |
| any extended nutrient key                      | See below.                                    |

Extended nutrients use the keys from `src/lib/nutrients.ts`, written either in
`snake_case` or `camelCase` — `saturated_fat` and `saturatedFat` both work, as do
`vitamin_b12`, `omega3`, `sodium`, `sugar` and the rest. Columns that match
nothing are ignored and reported in the preview.

All values are **per serving**, matching what the food form asks for.

### Example

```csv
name,brand,serving_size,serving_unit,calories,protein,carbs,fat,fiber,saturated_fat
Rolled Oats,Generic,100,g,389,13.2,66.3,6.9,10.6,1.2
Skyr Natural,Emmi,150,g,96,17.4,6.0,0.2,0,0.1
```

## What gets skipped

Rows are dropped in two places:

1. **Client-side, before the upload** — a row with an empty name, a bad serving
   size or unit, or a non-numeric/negative nutrient value. Each one is listed in
   the preview with its line number so you can fix the file and retry.
2. **Server-side, during the import** — a food whose `name` + `brand` + serving
   already exists in your database, or whose barcode is already taken. These come
   back as a "skipped" count rather than failing the import.

The import itself is one transaction: either every remaining row is created, or
none is.

## Limits

- 500 foods per import.
- 200 foods per bulk action (delete, favorite, labels) on the foods page.
