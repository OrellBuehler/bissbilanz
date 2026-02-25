# Bottom Sheet for Foods & Recipes

## Goal

Make foods and recipes use the same bottom sheet (ResponsiveModal) pattern as supplements — all create and edit flows happen in sheets on the list page, no separate full pages.

## Current State

- **Supplements:** Create and edit both use ResponsiveModal on the list page (the target pattern)
- **Foods:** Create uses ResponsiveModal, edit navigates to `/foods/[id]` full page, barcode create navigates to `/foods/new` full page
- **Recipes:** Create uses ResponsiveModal, edit navigates to `/recipes/[id]` full page

## Design

### Foods

- Click food in list → fetch food data → open ResponsiveModal with FoodForm pre-filled
- Barcode: navigate to `/foods?barcode=123` → auto-open modal with barcode pre-filled, fetch OpenFoodFacts data
- Image upload + favorite toggle move into FoodForm (shown when editing)
- Delete `/foods/[id]/+page.svelte` and `/foods/new/+page.svelte`
- All logic consolidates into `/foods/+page.svelte`

### Recipes

- Click recipe in list → fetch recipe data → open ResponsiveModal with form pre-filled
- Image upload + favorite toggle in the edit form
- Recipe edit form: name, servings, favorite, image, read-only ingredients list
- Delete `/recipes/[id]/+page.svelte`
- All logic consolidates into `/recipes/+page.svelte`

### FoodForm Changes

- Already accepts `initial` prop — pass existing food data as `initial` for edit mode
- Add optional `editing` boolean prop to show image upload and favorite toggle sections
- Add optional `imageUrl` and `onImageUpload` props for image handling
- Barcode scanning: when `onBarcodeScan` fires during create, stay in modal and fetch OFF data inline (no navigation)

### Files Changed

| File | Action |
|------|--------|
| `src/routes/(app)/foods/+page.svelte` | Major rewrite: add edit state, barcode URL handling, OFF fetch, image upload, update API |
| `src/routes/(app)/foods/[id]/+page.svelte` | Delete |
| `src/routes/(app)/foods/new/+page.svelte` | Delete |
| `src/lib/components/foods/FoodForm.svelte` | Add editing mode with image upload + favorite toggle |
| `src/routes/(app)/recipes/+page.svelte` | Major rewrite: add edit state, image upload, update API |
| `src/routes/(app)/recipes/[id]/+page.svelte` | Delete |

### Pattern (from supplements)

```svelte
let showForm = $state(false);
let editingItem = $state(null);

const openEdit = (item) => { editingItem = item; showForm = true; };
const closeForm = () => { showForm = false; editingItem = null; };

<ResponsiveModal bind:open={showForm} title={editingItem ? 'Edit' : 'New'}>
  <Form item={editingItem} onSave={editingItem ? update : create} onCancel={closeForm} />
</ResponsiveModal>
```
