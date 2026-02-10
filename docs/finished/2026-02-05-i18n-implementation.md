# Internationalization (i18n) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-language support to Bissbilanz using Paraglide JS, supporting English (default), German, French, and Italian.

**Architecture:** Paraglide JS compiles translations to type-safe message functions at build time, providing zero runtime overhead and full TypeScript support. URL-based locale detection with cookie persistence enables seamless language switching. All UI text is extracted to JSON message files organized by locale.

**Tech Stack:** Paraglide JS, SvelteKit Paraglide adapter, Inlang Message Format (JSON)

---

## Overview

### Why Paraglide JS?

1. **Zero runtime overhead** - Messages compile to functions, no runtime parsing
2. **Full type safety** - TypeScript knows all message keys and parameters
3. **Tree-shakeable** - Unused messages are eliminated from bundle
4. **Native SvelteKit support** - First-class adapter with SSR/SSG support
5. **Excellent DX** - IDE autocomplete, compile-time validation

### Supported Locales

| Locale | Language | Status |
|--------|----------|--------|
| `en` | English | Base (default) |
| `de` | German | Primary audience |
| `fr` | French | Secondary |
| `it` | Italian | Secondary |

### URL Strategy

- Base locale (English): `/app/foods` (no prefix)
- Other locales: `/de/app/foods`, `/fr/app/foods`, `/it/app/foods`
- Cookie persistence for returning users

---

## Task 1: Install Paraglide JS Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Paraglide packages**

Run:
```bash
bun add @inlang/paraglide-js
bun add -D @inlang/paraglide-sveltekit
```

**Step 2: Verify installation**

Run: `bun run check`
Expected: No TypeScript errors

**Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: add paraglide-js dependencies for i18n"
```

---

## Task 2: Create Inlang Project Configuration

**Files:**
- Create: `project.inlang/settings.json`

**Step 1: Create inlang project directory and settings**

Create `project.inlang/settings.json`:
```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "sourceLanguageTag": "en",
  "languageTags": ["en", "de", "fr", "it"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-empty-pattern@1/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-missing-translation@1/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-without-source@1/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@2/dist/index.js"
  ],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{languageTag}.json"
  }
}
```

**Step 2: Commit**

```bash
git add project.inlang/settings.json
git commit -m "chore: add inlang project configuration"
```

---

## Task 3: Create Base English Message File

**Files:**
- Create: `messages/en.json`

**Step 1: Create messages directory and English translations**

Create `messages/en.json`:
```json
{
  "app_title": "Bissbilanz",
  "app_tagline": "Track your nutrition with ease",

  "auth_login": "Login with Infomaniak",
  "auth_logout": "Logout",

  "nav_dashboard": "Dashboard",
  "nav_foods": "Foods",
  "nav_recipes": "Recipes",
  "nav_history": "History",
  "nav_goals": "Goals",
  "nav_settings": "Settings",

  "dashboard_today": "Today",
  "dashboard_scan": "Scan",
  "dashboard_copy_yesterday": "Copy Yesterday",
  "dashboard_copying": "Copying...",
  "dashboard_kcal": "{value} kcal",

  "meal_breakfast": "Breakfast",
  "meal_lunch": "Lunch",
  "meal_dinner": "Dinner",
  "meal_snacks": "Snacks",
  "meal_add_food": "Add Food",
  "meal_no_entries": "No entries",

  "add_food_title": "Add Food",
  "add_food_tab_search": "Search",
  "add_food_tab_favorites": "Favorites",
  "add_food_tab_recent": "Recent",
  "add_food_tab_recipes": "Recipes",
  "add_food_search_placeholder": "Search foods...",
  "add_food_search_recipes_placeholder": "Search recipes...",
  "add_food_no_favorites": "No favorites yet",
  "add_food_no_recent": "No recent foods",
  "add_food_no_recipes": "No recipes yet",
  "add_food_loading": "Loading...",
  "add_food_add": "Add",
  "add_food_servings": "Servings",

  "edit_entry_title": "Edit Entry",
  "edit_entry_servings": "Servings",
  "edit_entry_meal": "Meal",
  "edit_entry_select_meal": "Select meal",
  "edit_entry_delete": "Delete",
  "edit_entry_cancel": "Cancel",
  "edit_entry_save": "Save",

  "foods_title": "Foods",
  "foods_search_placeholder": "Search foods",
  "foods_new": "New Food",
  "foods_edit": "Edit",
  "foods_delete": "Delete",

  "food_form_name": "Name",
  "food_form_brand": "Brand",
  "food_form_barcode": "Barcode",
  "food_form_serving_size": "Serving size",
  "food_form_unit": "Unit (g, ml, piece)",
  "food_form_calories": "Calories",
  "food_form_protein": "Protein",
  "food_form_carbs": "Carbs",
  "food_form_fat": "Fat",
  "food_form_fiber": "Fiber",
  "food_form_advanced": "Advanced Nutrients",
  "food_form_sodium": "Sodium (mg)",
  "food_form_sugar": "Sugar (g)",
  "food_form_saturated_fat": "Saturated Fat (g)",
  "food_form_cholesterol": "Cholesterol (mg)",
  "food_form_favorite": "Favorite",
  "food_form_save": "Save",
  "food_form_cancel": "Cancel",
  "food_form_barcode_label": "Barcode: {barcode}",

  "recipes_title": "Recipes",
  "recipes_new": "New Recipe",
  "recipes_servings": "({count} servings)",
  "recipes_no_recipes": "No recipes yet",

  "recipe_form_title": "New Recipe",
  "recipe_form_name": "Recipe name",
  "recipe_form_servings": "Total servings:",
  "recipe_form_ingredients": "Ingredients",
  "recipe_form_add_ingredient": "+ Add ingredient",
  "recipe_form_cancel": "Cancel",
  "recipe_form_save": "Save recipe",
  "recipe_form_select_food": "Select food",
  "recipe_form_qty": "Qty",
  "recipe_form_unit": "Unit",

  "goals_title": "Goals",
  "goals_calories": "Calories",
  "goals_protein": "Protein (g)",
  "goals_carbs": "Carbs (g)",
  "goals_fat": "Fat (g)",
  "goals_fiber": "Fiber (g)",
  "goals_save": "Save",

  "history_title": "History",
  "history_weekly": "Weekly Average (7 days)",
  "history_monthly": "Monthly Average (30 days)",
  "history_loading": "Loading...",
  "history_back": "Back to Calendar",
  "history_daily_totals": "Daily Totals",

  "settings_title": "Settings",
  "settings_custom_meals": "Custom Meal Types",
  "settings_add_meal_placeholder": "Add meal type",
  "settings_add": "Add",
  "settings_remove": "Remove",
  "settings_language": "Language",

  "macro_calories": "Calories:",
  "macro_protein": "Protein:",
  "macro_carbs": "Carbs:",
  "macro_fat": "Fat:",
  "macro_fiber": "Fiber:",

  "barcode_title": "Scan Barcode",
  "barcode_error": "Error",
  "barcode_starting": "Starting camera...",

  "calendar_mon": "Mon",
  "calendar_tue": "Tue",
  "calendar_wed": "Wed",
  "calendar_thu": "Thu",
  "calendar_fri": "Fri",
  "calendar_sat": "Sat",
  "calendar_sun": "Sun",

  "month_january": "January",
  "month_february": "February",
  "month_march": "March",
  "month_april": "April",
  "month_may": "May",
  "month_june": "June",
  "month_july": "July",
  "month_august": "August",
  "month_september": "September",
  "month_october": "October",
  "month_november": "November",
  "month_december": "December",

  "error_unauthorized": "Unauthorized",
  "error_missing_date": "Missing date",
  "error_date_range_required": "Start date and end date required",
  "error_copy_dates_required": "Missing from date or to date",
  "error_recipe_not_found": "Recipe not found",
  "error_food_required": "Food or recipe is required",
  "error_generic": "An error occurred"
}
```

**Step 2: Commit**

```bash
git add messages/en.json
git commit -m "feat: add base English translations"
```

---

## Task 4: Create German Translation File

**Files:**
- Create: `messages/de.json`

**Step 1: Create German translations**

Create `messages/de.json`:
```json
{
  "app_title": "Bissbilanz",
  "app_tagline": "Verfolge deine Ernährung mit Leichtigkeit",

  "auth_login": "Mit Infomaniak anmelden",
  "auth_logout": "Abmelden",

  "nav_dashboard": "Übersicht",
  "nav_foods": "Lebensmittel",
  "nav_recipes": "Rezepte",
  "nav_history": "Verlauf",
  "nav_goals": "Ziele",
  "nav_settings": "Einstellungen",

  "dashboard_today": "Heute",
  "dashboard_scan": "Scannen",
  "dashboard_copy_yesterday": "Gestern kopieren",
  "dashboard_copying": "Kopiere...",
  "dashboard_kcal": "{value} kcal",

  "meal_breakfast": "Frühstück",
  "meal_lunch": "Mittagessen",
  "meal_dinner": "Abendessen",
  "meal_snacks": "Snacks",
  "meal_add_food": "Essen hinzufügen",
  "meal_no_entries": "Keine Einträge",

  "add_food_title": "Essen hinzufügen",
  "add_food_tab_search": "Suchen",
  "add_food_tab_favorites": "Favoriten",
  "add_food_tab_recent": "Kürzlich",
  "add_food_tab_recipes": "Rezepte",
  "add_food_search_placeholder": "Lebensmittel suchen...",
  "add_food_search_recipes_placeholder": "Rezepte suchen...",
  "add_food_no_favorites": "Noch keine Favoriten",
  "add_food_no_recent": "Keine kürzlichen Einträge",
  "add_food_no_recipes": "Noch keine Rezepte",
  "add_food_loading": "Laden...",
  "add_food_add": "Hinzufügen",
  "add_food_servings": "Portionen",

  "edit_entry_title": "Eintrag bearbeiten",
  "edit_entry_servings": "Portionen",
  "edit_entry_meal": "Mahlzeit",
  "edit_entry_select_meal": "Mahlzeit wählen",
  "edit_entry_delete": "Löschen",
  "edit_entry_cancel": "Abbrechen",
  "edit_entry_save": "Speichern",

  "foods_title": "Lebensmittel",
  "foods_search_placeholder": "Lebensmittel suchen",
  "foods_new": "Neues Lebensmittel",
  "foods_edit": "Bearbeiten",
  "foods_delete": "Löschen",

  "food_form_name": "Name",
  "food_form_brand": "Marke",
  "food_form_barcode": "Barcode",
  "food_form_serving_size": "Portionsgrösse",
  "food_form_unit": "Einheit (g, ml, Stück)",
  "food_form_calories": "Kalorien",
  "food_form_protein": "Protein",
  "food_form_carbs": "Kohlenhydrate",
  "food_form_fat": "Fett",
  "food_form_fiber": "Ballaststoffe",
  "food_form_advanced": "Erweiterte Nährwerte",
  "food_form_sodium": "Natrium (mg)",
  "food_form_sugar": "Zucker (g)",
  "food_form_saturated_fat": "Gesättigte Fettsäuren (g)",
  "food_form_cholesterol": "Cholesterin (mg)",
  "food_form_favorite": "Favorit",
  "food_form_save": "Speichern",
  "food_form_cancel": "Abbrechen",
  "food_form_barcode_label": "Barcode: {barcode}",

  "recipes_title": "Rezepte",
  "recipes_new": "Neues Rezept",
  "recipes_servings": "({count} Portionen)",
  "recipes_no_recipes": "Noch keine Rezepte",

  "recipe_form_title": "Neues Rezept",
  "recipe_form_name": "Rezeptname",
  "recipe_form_servings": "Gesamtportionen:",
  "recipe_form_ingredients": "Zutaten",
  "recipe_form_add_ingredient": "+ Zutat hinzufügen",
  "recipe_form_cancel": "Abbrechen",
  "recipe_form_save": "Rezept speichern",
  "recipe_form_select_food": "Lebensmittel wählen",
  "recipe_form_qty": "Menge",
  "recipe_form_unit": "Einheit",

  "goals_title": "Ziele",
  "goals_calories": "Kalorien",
  "goals_protein": "Protein (g)",
  "goals_carbs": "Kohlenhydrate (g)",
  "goals_fat": "Fett (g)",
  "goals_fiber": "Ballaststoffe (g)",
  "goals_save": "Speichern",

  "history_title": "Verlauf",
  "history_weekly": "Wochendurchschnitt (7 Tage)",
  "history_monthly": "Monatsdurchschnitt (30 Tage)",
  "history_loading": "Laden...",
  "history_back": "Zurück zum Kalender",
  "history_daily_totals": "Tagessummen",

  "settings_title": "Einstellungen",
  "settings_custom_meals": "Eigene Mahlzeitentypen",
  "settings_add_meal_placeholder": "Mahlzeitentyp hinzufügen",
  "settings_add": "Hinzufügen",
  "settings_remove": "Entfernen",
  "settings_language": "Sprache",

  "macro_calories": "Kalorien:",
  "macro_protein": "Protein:",
  "macro_carbs": "Kohlenhydrate:",
  "macro_fat": "Fett:",
  "macro_fiber": "Ballaststoffe:",

  "barcode_title": "Barcode scannen",
  "barcode_error": "Fehler",
  "barcode_starting": "Kamera wird gestartet...",

  "calendar_mon": "Mo",
  "calendar_tue": "Di",
  "calendar_wed": "Mi",
  "calendar_thu": "Do",
  "calendar_fri": "Fr",
  "calendar_sat": "Sa",
  "calendar_sun": "So",

  "month_january": "Januar",
  "month_february": "Februar",
  "month_march": "März",
  "month_april": "April",
  "month_may": "Mai",
  "month_june": "Juni",
  "month_july": "Juli",
  "month_august": "August",
  "month_september": "September",
  "month_october": "Oktober",
  "month_november": "November",
  "month_december": "Dezember",

  "error_unauthorized": "Nicht autorisiert",
  "error_missing_date": "Datum fehlt",
  "error_date_range_required": "Start- und Enddatum erforderlich",
  "error_copy_dates_required": "Von- oder Bis-Datum fehlt",
  "error_recipe_not_found": "Rezept nicht gefunden",
  "error_food_required": "Lebensmittel oder Rezept erforderlich",
  "error_generic": "Ein Fehler ist aufgetreten"
}
```

**Step 2: Commit**

```bash
git add messages/de.json
git commit -m "feat: add German translations"
```

---

## Task 5: Create French and Italian Translation Files

**Files:**
- Create: `messages/fr.json`
- Create: `messages/it.json`

**Step 1: Create French translations**

Create `messages/fr.json`:
```json
{
  "app_title": "Bissbilanz",
  "app_tagline": "Suivez votre nutrition facilement",

  "auth_login": "Connexion avec Infomaniak",
  "auth_logout": "Déconnexion",

  "nav_dashboard": "Tableau de bord",
  "nav_foods": "Aliments",
  "nav_recipes": "Recettes",
  "nav_history": "Historique",
  "nav_goals": "Objectifs",
  "nav_settings": "Paramètres",

  "dashboard_today": "Aujourd'hui",
  "dashboard_scan": "Scanner",
  "dashboard_copy_yesterday": "Copier hier",
  "dashboard_copying": "Copie...",
  "dashboard_kcal": "{value} kcal",

  "meal_breakfast": "Petit-déjeuner",
  "meal_lunch": "Déjeuner",
  "meal_dinner": "Dîner",
  "meal_snacks": "Collations",
  "meal_add_food": "Ajouter un aliment",
  "meal_no_entries": "Aucune entrée",

  "add_food_title": "Ajouter un aliment",
  "add_food_tab_search": "Rechercher",
  "add_food_tab_favorites": "Favoris",
  "add_food_tab_recent": "Récents",
  "add_food_tab_recipes": "Recettes",
  "add_food_search_placeholder": "Rechercher des aliments...",
  "add_food_search_recipes_placeholder": "Rechercher des recettes...",
  "add_food_no_favorites": "Pas encore de favoris",
  "add_food_no_recent": "Aucun aliment récent",
  "add_food_no_recipes": "Pas encore de recettes",
  "add_food_loading": "Chargement...",
  "add_food_add": "Ajouter",
  "add_food_servings": "Portions",

  "edit_entry_title": "Modifier l'entrée",
  "edit_entry_servings": "Portions",
  "edit_entry_meal": "Repas",
  "edit_entry_select_meal": "Sélectionner un repas",
  "edit_entry_delete": "Supprimer",
  "edit_entry_cancel": "Annuler",
  "edit_entry_save": "Enregistrer",

  "foods_title": "Aliments",
  "foods_search_placeholder": "Rechercher des aliments",
  "foods_new": "Nouvel aliment",
  "foods_edit": "Modifier",
  "foods_delete": "Supprimer",

  "food_form_name": "Nom",
  "food_form_brand": "Marque",
  "food_form_barcode": "Code-barres",
  "food_form_serving_size": "Taille de portion",
  "food_form_unit": "Unité (g, ml, pièce)",
  "food_form_calories": "Calories",
  "food_form_protein": "Protéines",
  "food_form_carbs": "Glucides",
  "food_form_fat": "Lipides",
  "food_form_fiber": "Fibres",
  "food_form_advanced": "Nutriments avancés",
  "food_form_sodium": "Sodium (mg)",
  "food_form_sugar": "Sucre (g)",
  "food_form_saturated_fat": "Graisses saturées (g)",
  "food_form_cholesterol": "Cholestérol (mg)",
  "food_form_favorite": "Favori",
  "food_form_save": "Enregistrer",
  "food_form_cancel": "Annuler",
  "food_form_barcode_label": "Code-barres: {barcode}",

  "recipes_title": "Recettes",
  "recipes_new": "Nouvelle recette",
  "recipes_servings": "({count} portions)",
  "recipes_no_recipes": "Pas encore de recettes",

  "recipe_form_title": "Nouvelle recette",
  "recipe_form_name": "Nom de la recette",
  "recipe_form_servings": "Portions totales:",
  "recipe_form_ingredients": "Ingrédients",
  "recipe_form_add_ingredient": "+ Ajouter un ingrédient",
  "recipe_form_cancel": "Annuler",
  "recipe_form_save": "Enregistrer la recette",
  "recipe_form_select_food": "Sélectionner un aliment",
  "recipe_form_qty": "Qté",
  "recipe_form_unit": "Unité",

  "goals_title": "Objectifs",
  "goals_calories": "Calories",
  "goals_protein": "Protéines (g)",
  "goals_carbs": "Glucides (g)",
  "goals_fat": "Lipides (g)",
  "goals_fiber": "Fibres (g)",
  "goals_save": "Enregistrer",

  "history_title": "Historique",
  "history_weekly": "Moyenne hebdomadaire (7 jours)",
  "history_monthly": "Moyenne mensuelle (30 jours)",
  "history_loading": "Chargement...",
  "history_back": "Retour au calendrier",
  "history_daily_totals": "Totaux journaliers",

  "settings_title": "Paramètres",
  "settings_custom_meals": "Types de repas personnalisés",
  "settings_add_meal_placeholder": "Ajouter un type de repas",
  "settings_add": "Ajouter",
  "settings_remove": "Supprimer",
  "settings_language": "Langue",

  "macro_calories": "Calories:",
  "macro_protein": "Protéines:",
  "macro_carbs": "Glucides:",
  "macro_fat": "Lipides:",
  "macro_fiber": "Fibres:",

  "barcode_title": "Scanner un code-barres",
  "barcode_error": "Erreur",
  "barcode_starting": "Démarrage de la caméra...",

  "calendar_mon": "Lun",
  "calendar_tue": "Mar",
  "calendar_wed": "Mer",
  "calendar_thu": "Jeu",
  "calendar_fri": "Ven",
  "calendar_sat": "Sam",
  "calendar_sun": "Dim",

  "month_january": "Janvier",
  "month_february": "Février",
  "month_march": "Mars",
  "month_april": "Avril",
  "month_may": "Mai",
  "month_june": "Juin",
  "month_july": "Juillet",
  "month_august": "Août",
  "month_september": "Septembre",
  "month_october": "Octobre",
  "month_november": "Novembre",
  "month_december": "Décembre",

  "error_unauthorized": "Non autorisé",
  "error_missing_date": "Date manquante",
  "error_date_range_required": "Date de début et de fin requises",
  "error_copy_dates_required": "Date de départ ou d'arrivée manquante",
  "error_recipe_not_found": "Recette non trouvée",
  "error_food_required": "Aliment ou recette requis",
  "error_generic": "Une erreur est survenue"
}
```

**Step 2: Create Italian translations**

Create `messages/it.json`:
```json
{
  "app_title": "Bissbilanz",
  "app_tagline": "Monitora la tua alimentazione con facilità",

  "auth_login": "Accedi con Infomaniak",
  "auth_logout": "Esci",

  "nav_dashboard": "Dashboard",
  "nav_foods": "Alimenti",
  "nav_recipes": "Ricette",
  "nav_history": "Cronologia",
  "nav_goals": "Obiettivi",
  "nav_settings": "Impostazioni",

  "dashboard_today": "Oggi",
  "dashboard_scan": "Scansiona",
  "dashboard_copy_yesterday": "Copia ieri",
  "dashboard_copying": "Copiando...",
  "dashboard_kcal": "{value} kcal",

  "meal_breakfast": "Colazione",
  "meal_lunch": "Pranzo",
  "meal_dinner": "Cena",
  "meal_snacks": "Spuntini",
  "meal_add_food": "Aggiungi cibo",
  "meal_no_entries": "Nessuna voce",

  "add_food_title": "Aggiungi cibo",
  "add_food_tab_search": "Cerca",
  "add_food_tab_favorites": "Preferiti",
  "add_food_tab_recent": "Recenti",
  "add_food_tab_recipes": "Ricette",
  "add_food_search_placeholder": "Cerca alimenti...",
  "add_food_search_recipes_placeholder": "Cerca ricette...",
  "add_food_no_favorites": "Nessun preferito",
  "add_food_no_recent": "Nessun alimento recente",
  "add_food_no_recipes": "Nessuna ricetta",
  "add_food_loading": "Caricamento...",
  "add_food_add": "Aggiungi",
  "add_food_servings": "Porzioni",

  "edit_entry_title": "Modifica voce",
  "edit_entry_servings": "Porzioni",
  "edit_entry_meal": "Pasto",
  "edit_entry_select_meal": "Seleziona pasto",
  "edit_entry_delete": "Elimina",
  "edit_entry_cancel": "Annulla",
  "edit_entry_save": "Salva",

  "foods_title": "Alimenti",
  "foods_search_placeholder": "Cerca alimenti",
  "foods_new": "Nuovo alimento",
  "foods_edit": "Modifica",
  "foods_delete": "Elimina",

  "food_form_name": "Nome",
  "food_form_brand": "Marca",
  "food_form_barcode": "Codice a barre",
  "food_form_serving_size": "Dimensione porzione",
  "food_form_unit": "Unità (g, ml, pezzo)",
  "food_form_calories": "Calorie",
  "food_form_protein": "Proteine",
  "food_form_carbs": "Carboidrati",
  "food_form_fat": "Grassi",
  "food_form_fiber": "Fibre",
  "food_form_advanced": "Nutrienti avanzati",
  "food_form_sodium": "Sodio (mg)",
  "food_form_sugar": "Zucchero (g)",
  "food_form_saturated_fat": "Grassi saturi (g)",
  "food_form_cholesterol": "Colesterolo (mg)",
  "food_form_favorite": "Preferito",
  "food_form_save": "Salva",
  "food_form_cancel": "Annulla",
  "food_form_barcode_label": "Codice a barre: {barcode}",

  "recipes_title": "Ricette",
  "recipes_new": "Nuova ricetta",
  "recipes_servings": "({count} porzioni)",
  "recipes_no_recipes": "Nessuna ricetta",

  "recipe_form_title": "Nuova ricetta",
  "recipe_form_name": "Nome ricetta",
  "recipe_form_servings": "Porzioni totali:",
  "recipe_form_ingredients": "Ingredienti",
  "recipe_form_add_ingredient": "+ Aggiungi ingrediente",
  "recipe_form_cancel": "Annulla",
  "recipe_form_save": "Salva ricetta",
  "recipe_form_select_food": "Seleziona alimento",
  "recipe_form_qty": "Qtà",
  "recipe_form_unit": "Unità",

  "goals_title": "Obiettivi",
  "goals_calories": "Calorie",
  "goals_protein": "Proteine (g)",
  "goals_carbs": "Carboidrati (g)",
  "goals_fat": "Grassi (g)",
  "goals_fiber": "Fibre (g)",
  "goals_save": "Salva",

  "history_title": "Cronologia",
  "history_weekly": "Media settimanale (7 giorni)",
  "history_monthly": "Media mensile (30 giorni)",
  "history_loading": "Caricamento...",
  "history_back": "Torna al calendario",
  "history_daily_totals": "Totali giornalieri",

  "settings_title": "Impostazioni",
  "settings_custom_meals": "Tipi di pasto personalizzati",
  "settings_add_meal_placeholder": "Aggiungi tipo di pasto",
  "settings_add": "Aggiungi",
  "settings_remove": "Rimuovi",
  "settings_language": "Lingua",

  "macro_calories": "Calorie:",
  "macro_protein": "Proteine:",
  "macro_carbs": "Carboidrati:",
  "macro_fat": "Grassi:",
  "macro_fiber": "Fibre:",

  "barcode_title": "Scansiona codice a barre",
  "barcode_error": "Errore",
  "barcode_starting": "Avvio fotocamera...",

  "calendar_mon": "Lun",
  "calendar_tue": "Mar",
  "calendar_wed": "Mer",
  "calendar_thu": "Gio",
  "calendar_fri": "Ven",
  "calendar_sat": "Sab",
  "calendar_sun": "Dom",

  "month_january": "Gennaio",
  "month_february": "Febbraio",
  "month_march": "Marzo",
  "month_april": "Aprile",
  "month_may": "Maggio",
  "month_june": "Giugno",
  "month_july": "Luglio",
  "month_august": "Agosto",
  "month_september": "Settembre",
  "month_october": "Ottobre",
  "month_november": "Novembre",
  "month_december": "Dicembre",

  "error_unauthorized": "Non autorizzato",
  "error_missing_date": "Data mancante",
  "error_date_range_required": "Data di inizio e fine richieste",
  "error_copy_dates_required": "Data di partenza o arrivo mancante",
  "error_recipe_not_found": "Ricetta non trovata",
  "error_food_required": "Alimento o ricetta richiesto",
  "error_generic": "Si è verificato un errore"
}
```

**Step 3: Commit**

```bash
git add messages/fr.json messages/it.json
git commit -m "feat: add French and Italian translations"
```

---

## Task 6: Configure Paraglide in Vite

**Files:**
- Modify: `vite.config.ts`

**Step 1: Read current vite.config.ts**

Read the file to understand current structure.

**Step 2: Add Paraglide plugin configuration**

Update `vite.config.ts` to include the paraglide compiler:

```typescript
import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		paraglide({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		}),
		sveltekit()
	]
});
```

**Step 3: Run build to generate paraglide output**

Run: `bun run build`
Expected: Build succeeds, `src/lib/paraglide/` directory created

**Step 4: Add paraglide output to .gitignore**

Add to `.gitignore`:
```
# Paraglide generated
src/lib/paraglide/
```

**Step 5: Commit**

```bash
git add vite.config.ts .gitignore
git commit -m "feat: configure paraglide vite plugin"
```

---

## Task 7: Configure SvelteKit Paraglide Adapter

**Files:**
- Modify: `src/hooks.server.ts`
- Create: `src/lib/i18n.ts`

**Step 1: Create i18n configuration module**

Create `src/lib/i18n.ts`:
```typescript
import { createI18n } from '@inlang/paraglide-sveltekit';
import * as runtime from '$lib/paraglide/runtime';

export const i18n = createI18n(runtime, {
	defaultLanguageTag: 'en',
	prefixDefaultLanguage: 'never'
});
```

**Step 2: Read current hooks.server.ts**

Read to understand existing middleware.

**Step 3: Update hooks.server.ts with i18n handle**

Integrate the i18n handle with existing session logic using `sequence`:

```typescript
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { i18n } from '$lib/i18n';
// ... existing imports

const sessionHandle: Handle = async ({ event, resolve }) => {
	// ... existing session logic
};

export const handle = sequence(i18n.handle(), sessionHandle);
```

**Step 4: Test the dev server**

Run: `bun run dev`
Expected: Server starts without errors

**Step 5: Commit**

```bash
git add src/lib/i18n.ts src/hooks.server.ts
git commit -m "feat: configure sveltekit paraglide adapter"
```

---

## Task 8: Add Reroute Hook for Locale Routing

**Files:**
- Create: `src/hooks.ts`

**Step 1: Create reroute hook**

Create `src/hooks.ts`:
```typescript
import { i18n } from '$lib/i18n';

export const reroute = i18n.reroute();
```

**Step 2: Commit**

```bash
git add src/hooks.ts
git commit -m "feat: add i18n reroute hook"
```

---

## Task 9: Update Root Layout with ParaglideJS

**Files:**
- Modify: `src/routes/+layout.svelte`
- Modify: `src/routes/+layout.server.ts` (create if needed)

**Step 1: Read current root layout**

Read `src/routes/+layout.svelte`.

**Step 2: Update layout to use ParaglideJS component**

Add the ParaglideJS component wrapper:

```svelte
<script lang="ts">
	import { ParaglideJS } from '@inlang/paraglide-sveltekit';
	import { i18n } from '$lib/i18n';
	// ... existing imports

	let { children } = $props();
</script>

<ParaglideJS {i18n}>
	{@render children()}
</ParaglideJS>
```

**Step 3: Create/update layout.server.ts**

Create or update `src/routes/+layout.server.ts`:
```typescript
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	// Return locale for client
	return {
		locale: event.locals.paraglide?.lang ?? 'en'
	};
};
```

**Step 4: Test locale detection**

Run: `bun run dev`
Navigate to: `http://localhost:5173/de/app`
Expected: German locale is detected

**Step 5: Commit**

```bash
git add src/routes/+layout.svelte src/routes/+layout.server.ts
git commit -m "feat: add ParaglideJS wrapper to root layout"
```

---

## Task 10: Update Landing Page with Translations

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Read current landing page**

Read `src/routes/+page.svelte`.

**Step 2: Replace hardcoded text with message functions**

```svelte
<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	// ... existing imports
</script>

<!-- Replace hardcoded text -->
<h1>{m.app_title()}</h1>
<p>{m.app_tagline()}</p>
<button>{m.auth_login()}</button>
```

**Step 3: Test translations**

Run: `bun run dev`
Navigate to: `http://localhost:5173/de`
Expected: German text displayed

**Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: add i18n to landing page"
```

---

## Task 11: Update App Layout with Translations

**Files:**
- Modify: `src/routes/app/+layout.svelte`

**Step 1: Read current app layout**

Read `src/routes/app/+layout.svelte`.

**Step 2: Replace navigation and UI text with message functions**

```svelte
<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	// ... existing imports
</script>

<!-- Replace hardcoded navigation labels -->
<a href="/app">{m.nav_dashboard()}</a>
<a href="/app/foods">{m.nav_foods()}</a>
<a href="/app/recipes">{m.nav_recipes()}</a>
<!-- ... etc -->
<button>{m.auth_logout()}</button>
```

**Step 3: Commit**

```bash
git add src/routes/app/+layout.svelte
git commit -m "feat: add i18n to app layout navigation"
```

---

## Task 12: Update Dashboard Page with Translations

**Files:**
- Modify: `src/routes/app/+page.svelte`

**Step 1: Read current dashboard**

Read `src/routes/app/+page.svelte`.

**Step 2: Replace all hardcoded text**

Import messages and replace:
- "Today" → `m.dashboard_today()`
- "Scan" → `m.dashboard_scan()`
- "Copy Yesterday" → `m.dashboard_copy_yesterday()`
- "Copying..." → `m.dashboard_copying()`
- "{value} kcal" → `m.dashboard_kcal({ value: totals.calories })`

**Step 3: Commit**

```bash
git add src/routes/app/+page.svelte
git commit -m "feat: add i18n to dashboard"
```

---

## Task 13: Update Meal Utilities with Translations

**Files:**
- Modify: `src/lib/utils/meals.ts`

**Step 1: Read current meals utility**

Read `src/lib/utils/meals.ts`.

**Step 2: Create meal type translation helper**

Update to use message functions:

```typescript
import * as m from '$lib/paraglide/messages';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export function getMealLabel(mealType: MealType): string {
	const labels: Record<MealType, () => string> = {
		breakfast: m.meal_breakfast,
		lunch: m.meal_lunch,
		dinner: m.meal_dinner,
		snacks: m.meal_snacks
	};
	return labels[mealType]();
}

export const DEFAULT_MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
```

**Step 3: Commit**

```bash
git add src/lib/utils/meals.ts
git commit -m "feat: add i18n to meal type utilities"
```

---

## Task 14: Update Date Utilities with Translations

**Files:**
- Modify: `src/lib/utils/dates.ts`

**Step 1: Read current dates utility**

Read `src/lib/utils/dates.ts`.

**Step 2: Replace hardcoded month names with message functions**

```typescript
import * as m from '$lib/paraglide/messages';

export function getMonthName(month: number): string {
	const months = [
		m.month_january,
		m.month_february,
		m.month_march,
		m.month_april,
		m.month_may,
		m.month_june,
		m.month_july,
		m.month_august,
		m.month_september,
		m.month_october,
		m.month_november,
		m.month_december
	];
	return months[month]();
}
```

**Step 3: Commit**

```bash
git add src/lib/utils/dates.ts
git commit -m "feat: add i18n to date utilities"
```

---

## Task 15: Update MealSection Component

**Files:**
- Modify: `src/lib/components/entries/MealSection.svelte`

**Step 1: Read current component**

Read `src/lib/components/entries/MealSection.svelte`.

**Step 2: Replace hardcoded text**

```svelte
<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	// ... existing imports
</script>

<button>{m.meal_add_food()}</button>
<p>{m.meal_no_entries()}</p>
```

**Step 3: Commit**

```bash
git add src/lib/components/entries/MealSection.svelte
git commit -m "feat: add i18n to MealSection component"
```

---

## Task 16: Update AddFoodModal Component

**Files:**
- Modify: `src/lib/components/entries/AddFoodModal.svelte`

**Step 1: Read current component**

Read `src/lib/components/entries/AddFoodModal.svelte`.

**Step 2: Replace all hardcoded text (13 strings)**

Import messages and replace all tab labels, placeholders, empty states, and button text.

**Step 3: Commit**

```bash
git add src/lib/components/entries/AddFoodModal.svelte
git commit -m "feat: add i18n to AddFoodModal component"
```

---

## Task 17: Update EditEntryModal Component

**Files:**
- Modify: `src/lib/components/entries/EditEntryModal.svelte`

**Step 1: Read current component**

Read `src/lib/components/entries/EditEntryModal.svelte`.

**Step 2: Replace all hardcoded text (7 strings)**

Import messages and replace modal title, labels, and button text.

**Step 3: Commit**

```bash
git add src/lib/components/entries/EditEntryModal.svelte
git commit -m "feat: add i18n to EditEntryModal component"
```

---

## Task 18: Update FoodForm Component

**Files:**
- Modify: `src/lib/components/foods/FoodForm.svelte`

**Step 1: Read current component**

Read `src/lib/components/foods/FoodForm.svelte`.

**Step 2: Replace all placeholder and label text (20+ strings)**

Import messages and replace all form field placeholders and labels.

**Step 3: Commit**

```bash
git add src/lib/components/foods/FoodForm.svelte
git commit -m "feat: add i18n to FoodForm component"
```

---

## Task 19: Update Foods Page and FoodList Component

**Files:**
- Modify: `src/routes/app/foods/+page.svelte`
- Modify: `src/lib/components/foods/FoodList.svelte`

**Step 1: Read both files**

**Step 2: Replace hardcoded text in both files**

**Step 3: Commit**

```bash
git add src/routes/app/foods/+page.svelte src/lib/components/foods/FoodList.svelte
git commit -m "feat: add i18n to foods page and list"
```

---

## Task 20: Update Recipe Components

**Files:**
- Modify: `src/routes/app/recipes/+page.svelte`
- Modify: `src/lib/components/recipes/RecipeForm.svelte`
- Modify: `src/lib/components/recipes/IngredientRow.svelte`

**Step 1: Read all three files**

**Step 2: Replace hardcoded text in each**

**Step 3: Commit**

```bash
git add src/routes/app/recipes/+page.svelte src/lib/components/recipes/RecipeForm.svelte src/lib/components/recipes/IngredientRow.svelte
git commit -m "feat: add i18n to recipe components"
```

---

## Task 21: Update Goals Page

**Files:**
- Modify: `src/routes/app/goals/+page.svelte`

**Step 1: Read current goals page**

**Step 2: Replace all label text (7 strings)**

**Step 3: Commit**

```bash
git add src/routes/app/goals/+page.svelte
git commit -m "feat: add i18n to goals page"
```

---

## Task 22: Update History Page and Calendar Component

**Files:**
- Modify: `src/routes/app/history/+page.svelte`
- Modify: `src/routes/app/history/[date]/+page.svelte`
- Modify: `src/lib/components/history/Calendar.svelte`

**Step 1: Read all history-related files**

**Step 2: Replace weekday abbreviations in Calendar**

```svelte
<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	const weekdays = [
		m.calendar_sun,
		m.calendar_mon,
		m.calendar_tue,
		m.calendar_wed,
		m.calendar_thu,
		m.calendar_fri,
		m.calendar_sat
	];
</script>

{#each weekdays as day}
	<span>{day()}</span>
{/each}
```

**Step 3: Replace text in history pages**

**Step 4: Commit**

```bash
git add src/routes/app/history/+page.svelte src/routes/app/history/[date]/+page.svelte src/lib/components/history/Calendar.svelte
git commit -m "feat: add i18n to history pages and calendar"
```

---

## Task 23: Update Settings Page

**Files:**
- Modify: `src/routes/app/settings/+page.svelte`

**Step 1: Read current settings page**

**Step 2: Replace hardcoded text**

**Step 3: Commit**

```bash
git add src/routes/app/settings/+page.svelte
git commit -m "feat: add i18n to settings page"
```

---

## Task 24: Update MacroSummary Component

**Files:**
- Modify: `src/lib/components/MacroSummary.svelte`

**Step 1: Read current component**

**Step 2: Replace macro labels**

**Step 3: Commit**

```bash
git add src/lib/components/MacroSummary.svelte
git commit -m "feat: add i18n to MacroSummary component"
```

---

## Task 25: Update Barcode Components

**Files:**
- Modify: `src/lib/components/barcode/BarcodeScanModal.svelte`
- Modify: `src/lib/components/barcode/BarcodeScanner.svelte`

**Step 1: Read both barcode components**

**Step 2: Replace hardcoded text**

**Step 3: Commit**

```bash
git add src/lib/components/barcode/BarcodeScanModal.svelte src/lib/components/barcode/BarcodeScanner.svelte
git commit -m "feat: add i18n to barcode components"
```

---

## Task 26: Add Language Switcher Component

**Files:**
- Create: `src/lib/components/LanguageSwitcher.svelte`
- Modify: `src/routes/app/settings/+page.svelte`

**Step 1: Create language switcher component**

Create `src/lib/components/LanguageSwitcher.svelte`:
```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { locales, localizeHref, getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	const localeNames: Record<string, string> = {
		en: 'English',
		de: 'Deutsch',
		fr: 'Français',
		it: 'Italiano'
	};

	const currentLocale = getLocale();
</script>

<div class="space-y-2">
	<label class="text-sm font-medium">{m.settings_language()}</label>
	<div class="flex flex-wrap gap-2">
		{#each locales as locale}
			<a
				href={localizeHref(page.url.pathname, { locale })}
				data-sveltekit-reload
				class="px-3 py-1.5 rounded-md text-sm {locale === currentLocale
					? 'bg-primary text-primary-foreground'
					: 'bg-muted hover:bg-muted/80'}"
			>
				{localeNames[locale]}
			</a>
		{/each}
	</div>
</div>
```

**Step 2: Add to settings page**

Import and use the LanguageSwitcher in the settings page.

**Step 3: Commit**

```bash
git add src/lib/components/LanguageSwitcher.svelte src/routes/app/settings/+page.svelte
git commit -m "feat: add language switcher to settings"
```

---

## Task 27: Update Navigation Links for Locale Awareness

**Files:**
- Modify: `src/routes/app/+layout.svelte`

**Step 1: Update all internal links to use localizeHref**

```svelte
<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
</script>

<a href={localizeHref('/app')}>Dashboard</a>
<a href={localizeHref('/app/foods')}>Foods</a>
<!-- etc -->
```

**Step 2: Commit**

```bash
git add src/routes/app/+layout.svelte
git commit -m "feat: make navigation links locale-aware"
```

---

## Task 28: Verify All Translations Work

**Files:** None (testing task)

**Step 1: Start dev server**

Run: `bun run dev`

**Step 2: Test each locale**

Navigate to:
- `http://localhost:5173/` (English)
- `http://localhost:5173/de/` (German)
- `http://localhost:5173/fr/` (French)
- `http://localhost:5173/it/` (Italian)

**Step 3: Verify all pages render correctly**

Check each main page:
- Landing page
- Dashboard
- Foods
- Recipes
- Goals
- History
- Settings

**Step 4: Test language switcher**

Navigate to Settings and switch languages.

Expected: All text updates to selected language.

---

## Task 29: Run Type Check and Fix Any Issues

**Files:** Various (as needed)

**Step 1: Run type check**

Run: `bun run check`

**Step 2: Fix any TypeScript errors**

Address any type errors related to message function usage.

**Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve i18n type errors"
```

---

## Task 30: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add i18n section to CLAUDE.md**

Add documentation about:
- How to add new translations
- Translation file structure
- Using message functions in components
- Language switcher usage

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add i18n documentation to CLAUDE.md"
```

---

## Summary

### Files Created
- `project.inlang/settings.json`
- `messages/en.json`
- `messages/de.json`
- `messages/fr.json`
- `messages/it.json`
- `src/lib/i18n.ts`
- `src/hooks.ts`
- `src/lib/components/LanguageSwitcher.svelte`

### Files Modified
- `package.json`
- `vite.config.ts`
- `.gitignore`
- `src/hooks.server.ts`
- `src/routes/+layout.svelte`
- `src/routes/+layout.server.ts`
- `src/routes/+page.svelte`
- `src/routes/app/+layout.svelte`
- `src/routes/app/+page.svelte`
- `src/routes/app/foods/+page.svelte`
- `src/routes/app/recipes/+page.svelte`
- `src/routes/app/goals/+page.svelte`
- `src/routes/app/history/+page.svelte`
- `src/routes/app/history/[date]/+page.svelte`
- `src/routes/app/settings/+page.svelte`
- `src/lib/utils/meals.ts`
- `src/lib/utils/dates.ts`
- `src/lib/components/entries/MealSection.svelte`
- `src/lib/components/entries/AddFoodModal.svelte`
- `src/lib/components/entries/EditEntryModal.svelte`
- `src/lib/components/foods/FoodForm.svelte`
- `src/lib/components/foods/FoodList.svelte`
- `src/lib/components/recipes/RecipeForm.svelte`
- `src/lib/components/recipes/IngredientRow.svelte`
- `src/lib/components/history/Calendar.svelte`
- `src/lib/components/MacroSummary.svelte`
- `src/lib/components/barcode/BarcodeScanModal.svelte`
- `src/lib/components/barcode/BarcodeScanner.svelte`
- `CLAUDE.md`

### Total Tasks: 30
### Estimated Commits: 25+

---

## Post-Implementation Notes

### Adding New Translations

1. Add key to `messages/en.json`
2. Add translations to `de.json`, `fr.json`, `it.json`
3. Import and use in component: `import * as m from '$lib/paraglide/messages'`
4. Call message function: `m.your_key()`

### Adding New Locales

1. Add locale to `project.inlang/settings.json` → `languageTags`
2. Create `messages/{locale}.json` with all translations
3. Update `LanguageSwitcher.svelte` with locale name

### Parameterized Messages

```json
// messages/en.json
{ "greeting": "Hello {name}!" }
```

```svelte
<p>{m.greeting({ name: user.name })}</p>
```

### Pluralization

```json
// messages/en.json
{ "items": "{count, plural, one {# item} other {# items}}" }
```

```svelte
<p>{m.items({ count: 5 })}</p>
```
