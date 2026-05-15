<!-- AUTO-GENERATED. Do not edit. Regenerate via `make index`. -->
# Codebase Index — Backend

Generated: 2026-05-15T05:42:29Z
Commit: 259d938

---

## Backend Models

### `Instrument` → table `instruments`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `name` | `String` |  |  |  |  |  |  |
| `is_favorite` | `Boolean` |  |  |  |  |  | `False` |
| `location` | `String` | ✓ |  |  |  |  |  |

**Relationships:**
- `lasers` → Laser back_populates=instrument cascade=all, delete-orphan

### `Laser` → table `lasers`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `instrument_id` | `String(36)` |  |  |  | `instruments.id` | `CASCADE` |  |
| `wavelength_nm` | `Integer` |  |  |  |  |  |  |
| `name` | `String` |  |  |  |  |  |  |

**Relationships:**
- `instrument` → Instrument back_populates=lasers
- `detectors` → Detector back_populates=laser cascade=all, delete-orphan

### `Detector` → table `detectors`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `laser_id` | `String(36)` |  |  |  | `lasers.id` | `CASCADE` |  |
| `filter_midpoint` | `Integer` |  |  |  |  |  |  |
| `filter_width` | `Integer` |  |  |  |  |  |  |
| `name` | `String` | ✓ |  |  |  |  |  |

**Relationships:**
- `laser` → Laser back_populates=detectors

### `Fluorophore` → table `fluorophores`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(100)` |  | ✓ |  |  |  |  |
| `name` | `String` |  |  | ✓ |  |  |  |
| `fluor_type` | `String` | ✓ |  |  |  |  |  |
| `source` | `String` |  |  |  |  |  | `'FPbase'` |
| `ex_max_nm` | `Float` | ✓ |  |  |  |  |  |
| `em_max_nm` | `Float` | ✓ |  |  |  |  |  |
| `ext_coeff` | `Float` | ✓ |  |  |  |  |  |
| `qy` | `Float` | ✓ |  |  |  |  |  |
| `lifetime_ns` | `Float` | ✓ |  |  |  |  |  |
| `oligomerization` | `String` | ✓ |  |  |  |  |  |
| `switch_type` | `String` | ✓ |  |  |  |  |  |
| `has_spectra` | `Boolean` |  |  |  |  |  | `False` |
| `is_favorite` | `Boolean` |  |  |  |  |  | `False` |

**Relationships:**
- `spectra_records` → FluorophoreSpectrum back_populates=fluorophore cascade=all, delete-orphan

### `FluorophoreSpectrum` → table `fluorophore_spectra`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `Integer` |  | ✓ |  |  |  |  |
| `fluorophore_id` | `String(100)` |  |  |  | `fluorophores.id` | `CASCADE` |  |
| `spectrum_type` | `String(10)` |  |  |  |  |  |  |
| `wavelength_nm` | `Float` |  |  |  |  |  |  |
| `intensity` | `Float` |  |  |  |  |  |  |

**Table args:**
- `Index('ix_fluor_spectra', 'fluorophore_id', 'spectrum_type', 'wavelength_nm')`

**Relationships:**
- `fluorophore` → Fluorophore back_populates=spectra_records

### `Antibody` → table `antibodies`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `name` | `String` | ✓ |  |  |  |  |  |
| `target` | `String` |  |  |  |  |  |  |
| `clone` | `String` | ✓ |  |  |  |  |  |
| `host` | `String` | ✓ |  |  |  |  |  |
| `isotype` | `String` | ✓ |  |  |  |  |  |
| `fluorophore_id` | `String(100)` | ✓ |  |  | `fluorophores.id` | `SET NULL` |  |
| `conjugate` | `String` | ✓ |  |  |  |  |  |
| `vendor` | `String` | ✓ |  |  |  |  |  |
| `catalog_number` | `String` | ✓ |  |  |  |  |  |
| `confirmed_in_stock` | `Boolean` |  |  |  |  |  | `False` |
| `date_received` | `String` | ✓ |  |  |  |  |  |
| `flow_dilution` | `String` | ✓ |  |  |  |  |  |
| `icc_if_dilution` | `String` | ✓ |  |  |  |  |  |
| `wb_dilution` | `String` | ✓ |  |  |  |  |  |
| `flow_dilution_factor` | `Integer` | ✓ |  |  |  |  |  |
| `icc_if_dilution_factor` | `Integer` | ✓ |  |  |  |  |  |
| `wb_dilution_factor` | `Integer` | ✓ |  |  |  |  |  |
| `reacts_with` | `Text` | ✓ |  |  |  |  |  |
| `storage_temp` | `String` | ✓ |  |  |  |  |  |
| `validation_notes` | `Text` | ✓ |  |  |  |  |  |
| `notes` | `Text` | ✓ |  |  |  |  |  |
| `website` | `String` | ✓ |  |  |  |  |  |
| `physical_location` | `String` | ✓ |  |  |  |  |  |
| `is_favorite` | `Boolean` |  |  |  |  |  | `False` |
| `created_at` | `DateTime` | ✓ |  |  |  |  |  |
| `updated_at` | `DateTime` | ✓ |  |  |  |  |  |

**Table args:**
- `UniqueConstraint('name', 'catalog_number', name='uq_antibody_name_catalog')`

**Relationships:**
- `fluorophore` → Fluorophore
- `tags` → AntibodyTag back_populates=antibodies

### `Panel` → table `panels`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `name` | `String` |  |  |  |  |  |  |
| `instrument_id` | `String(36)` | ✓ |  |  | `instruments.id` | `SET NULL` |  |
| `created_at` | `DateTime` | ✓ |  |  |  |  |  |
| `updated_at` | `DateTime` | ✓ |  |  |  |  |  |

**Relationships:**
- `instrument` → Instrument
- `targets` → PanelTarget back_populates=panel cascade=all, delete-orphan
- `assignments` → PanelAssignment back_populates=panel cascade=all, delete-orphan

### `SecondaryAntibody` → table `secondary_antibodies`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `name` | `String` |  |  |  |  |  |  |
| `host` | `String` |  |  |  |  |  |  |
| `target_species` | `String` |  |  |  |  |  |  |
| `target_isotype` | `String` | ✓ |  |  |  |  |  |
| `binding_mode` | `String(20)` |  |  |  |  |  | `'species'` |
| `target_conjugate` | `String` | ✓ |  |  |  |  |  |
| `fluorophore_id` | `String(100)` | ✓ |  |  | `fluorophores.id` | `SET NULL` |  |
| `vendor` | `String` | ✓ |  |  |  |  |  |
| `catalog_number` | `String` | ✓ |  |  |  |  |  |
| `lot_number` | `String` | ✓ |  |  |  |  |  |
| `notes` | `Text` | ✓ |  |  |  |  |  |
| `created_at` | `DateTime` | ✓ |  |  |  |  |  |
| `updated_at` | `DateTime` | ✓ |  |  |  |  |  |

**Relationships:**
- `fluorophore` → Fluorophore

### `PanelTarget` → table `panel_targets`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `panel_id` | `String(36)` |  |  |  | `panels.id` | `CASCADE` |  |
| `antibody_id` | `String(36)` | ✓ |  |  | `antibodies.id` | `CASCADE` |  |
| `dye_label_id` | `String(36)` | ✓ |  |  | `dye_labels.id` | `CASCADE` |  |
| `staining_mode` | `String(10)` |  |  |  |  |  | `'direct'` |
| `secondary_antibody_id` | `String(36)` | ✓ |  |  | `secondary_antibodies.id` | `SET NULL` |  |
| `sort_order` | `Integer` |  |  |  |  |  | `0` |

**Table args:**
- `UniqueConstraint('panel_id', 'antibody_id', name='uq_panel_target')`

**Relationships:**
- `panel` → Panel back_populates=targets
- `antibody` → Antibody
- `dye_label` → DyeLabel
- `secondary_antibody` → SecondaryAntibody

### `PanelAssignment` → table `panel_assignments`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `panel_id` | `String(36)` |  |  |  | `panels.id` | `CASCADE` |  |
| `antibody_id` | `String(36)` | ✓ |  |  | `antibodies.id` | `CASCADE` |  |
| `dye_label_id` | `String(36)` | ✓ |  |  | `dye_labels.id` | `CASCADE` |  |
| `fluorophore_id` | `String(100)` |  |  |  | `fluorophores.id` | `CASCADE` |  |
| `detector_id` | `String(36)` |  |  |  | `detectors.id` | `CASCADE` |  |
| `notes` | `Text` | ✓ |  |  |  |  |  |

**Table args:**
- `UniqueConstraint('panel_id', 'detector_id', name='uq_panel_detector')`

**Relationships:**
- `panel` → Panel back_populates=assignments
- `antibody` → Antibody
- `dye_label` → DyeLabel
- `fluorophore` → Fluorophore
- `detector` → Detector

### `AntibodyTag` → table `antibody_tags`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `name` | `String` |  |  | ✓ |  |  |  |
| `color` | `String` | ✓ |  |  |  |  |  |

**Relationships:**
- `antibodies` → Antibody back_populates=tags

### `AntibodyTagAssignment` → table `antibody_tag_assignments`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `antibody_id` | `String(36)` |  | ✓ |  | `antibodies.id` | `CASCADE` |  |
| `tag_id` | `String(36)` |  | ✓ |  | `antibody_tags.id` | `CASCADE` |  |

### `UserPreference` → table `user_preferences`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `key` | `String` |  | ✓ |  |  |  |  |
| `value` | `String` |  |  |  |  |  |  |

### `ListEntry` → table `list_entries`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `list_type` | `String` |  |  |  |  |  |  |
| `value` | `String` |  |  |  |  |  |  |
| `sort_order` | `Integer` |  |  |  |  |  | `0` |

**Table args:**
- `UniqueConstraint('list_type', 'value', name='uq_list_entry')`

### `ConjugateChemistry` → table `conjugate_chemistries`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `name` | `String` |  |  | ✓ |  |  |  |
| `label` | `String` |  |  |  |  |  |  |
| `sort_order` | `Integer` |  |  |  |  |  | `0` |

### `InstrumentView` → table `instrument_views`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `Integer` |  | ✓ |  |  |  |  |
| `instrument_id` | `String(36)` |  |  |  | `instruments.id` | `CASCADE` |  |
| `viewed_at` | `DateTime` | ✓ |  |  |  |  |  |

**Table args:**
- `Index('ix_instrument_views_instrument_viewed', 'instrument_id', 'viewed_at')`

### `PlateMap` → table `plate_maps`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `name` | `String` |  |  |  |  |  |  |
| `description` | `Text` | ✓ |  |  |  |  |  |
| `plate_type` | `String(20)` |  |  |  |  |  | `'96-well'` |
| `well_data` | `Text` |  |  |  |  |  | `'{}'` |
| `legend` | `Text` |  |  |  |  |  | `'{}'` |
| `created_at` | `DateTime` | ✓ |  |  |  |  |  |
| `updated_at` | `DateTime` | ✓ |  |  |  |  |  |

### `Microscope` → table `microscopes`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `name` | `String` |  |  |  |  |  |  |
| `is_favorite` | `Boolean` |  |  |  |  |  | `False` |
| `location` | `String` | ✓ |  |  |  |  |  |

**Relationships:**
- `lasers` → MicroscopeLaser back_populates=microscope cascade=all, delete-orphan

### `MicroscopeLaser` → table `microscope_lasers`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `microscope_id` | `String(36)` |  |  |  | `microscopes.id` | `CASCADE` |  |
| `wavelength_nm` | `Integer` |  |  |  |  |  |  |
| `name` | `String` |  |  |  |  |  |  |
| `excitation_type` | `String(10)` |  |  |  |  |  | `'laser'` |
| `ex_filter_width` | `Integer` | ✓ |  |  |  |  |  |

**Relationships:**
- `microscope` → Microscope back_populates=lasers
- `filters` → MicroscopeFilter back_populates=laser cascade=all, delete-orphan

### `MicroscopeFilter` → table `microscope_filters`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `laser_id` | `String(36)` |  |  |  | `microscope_lasers.id` | `CASCADE` |  |
| `filter_midpoint` | `Integer` |  |  |  |  |  |  |
| `filter_width` | `Integer` |  |  |  |  |  |  |
| `name` | `String` | ✓ |  |  |  |  |  |

**Relationships:**
- `laser` → MicroscopeLaser back_populates=filters

### `MicroscopeView` → table `microscope_views`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `Integer` |  | ✓ |  |  |  |  |
| `microscope_id` | `String(36)` |  |  |  | `microscopes.id` | `CASCADE` |  |
| `viewed_at` | `DateTime` | ✓ |  |  |  |  |  |

**Table args:**
- `Index('ix_microscope_views_microscope_viewed', 'microscope_id', 'viewed_at')`

### `IFPanel` → table `if_panels`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `name` | `String` |  |  |  |  |  |  |
| `panel_type` | `String(3)` |  |  |  |  |  | `'IF'` |
| `microscope_id` | `String(36)` | ✓ |  |  | `microscopes.id` | `SET NULL` |  |
| `view_mode` | `String(10)` |  |  |  |  |  | `'simple'` |
| `created_at` | `DateTime` | ✓ |  |  |  |  |  |
| `updated_at` | `DateTime` | ✓ |  |  |  |  |  |

**Relationships:**
- `microscope` → Microscope
- `targets` → IFPanelTarget back_populates=panel cascade=all, delete-orphan
- `assignments` → IFPanelAssignment back_populates=panel cascade=all, delete-orphan

### `IFPanelTarget` → table `if_panel_targets`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `panel_id` | `String(36)` |  |  |  | `if_panels.id` | `CASCADE` |  |
| `antibody_id` | `String(36)` | ✓ |  |  | `antibodies.id` | `CASCADE` |  |
| `dye_label_id` | `String(36)` | ✓ |  |  | `dye_labels.id` | `CASCADE` |  |
| `staining_mode` | `String(10)` |  |  |  |  |  | `'direct'` |
| `secondary_antibody_id` | `String(36)` | ✓ |  |  | `secondary_antibodies.id` | `SET NULL` |  |
| `sort_order` | `Integer` |  |  |  |  |  | `0` |
| `dilution_override` | `String` | ✓ |  |  |  |  |  |

**Table args:**
- `UniqueConstraint('panel_id', 'antibody_id', name='uq_if_panel_target')`

**Relationships:**
- `panel` → IFPanel back_populates=targets
- `antibody` → Antibody
- `dye_label` → DyeLabel
- `secondary_antibody` → SecondaryAntibody

### `IFPanelAssignment` → table `if_panel_assignments`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `panel_id` | `String(36)` |  |  |  | `if_panels.id` | `CASCADE` |  |
| `antibody_id` | `String(36)` | ✓ |  |  | `antibodies.id` | `CASCADE` |  |
| `dye_label_id` | `String(36)` | ✓ |  |  | `dye_labels.id` | `CASCADE` |  |
| `fluorophore_id` | `String(100)` |  |  |  | `fluorophores.id` | `CASCADE` |  |
| `filter_id` | `String(36)` | ✓ |  |  | `microscope_filters.id` | `SET NULL` |  |
| `notes` | `Text` | ✓ |  |  |  |  |  |

**Relationships:**
- `panel` → IFPanel back_populates=assignments
- `antibody` → Antibody
- `dye_label` → DyeLabel
- `fluorophore` → Fluorophore
- `filter` → MicroscopeFilter

### `Experiment` → table `experiments`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `name` | `String` |  |  |  |  |  |  |
| `description` | `Text` | ✓ |  |  |  |  |  |
| `created_at` | `DateTime` | ✓ |  |  |  |  |  |
| `updated_at` | `DateTime` | ✓ |  |  |  |  |  |

**Relationships:**
- `blocks` → ExperimentBlock back_populates=experiment cascade=all, delete-orphan

### `DyeLabel` → table `dye_labels`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `name` | `String` |  |  | ✓ |  |  |  |
| `label_target` | `String` |  |  |  |  |  |  |
| `category` | `String` | ✓ |  |  |  |  |  |
| `fluorophore_id` | `String(100)` | ✓ |  |  | `fluorophores.id` | `SET NULL` |  |
| `vendor` | `String` | ✓ |  |  |  |  |  |
| `catalog_number` | `String` | ✓ |  |  |  |  |  |
| `lot_number` | `String` | ✓ |  |  |  |  |  |
| `flow_dilution` | `String` | ✓ |  |  |  |  |  |
| `icc_if_dilution` | `String` | ✓ |  |  |  |  |  |
| `flow_dilution_factor` | `Integer` | ✓ |  |  |  |  |  |
| `icc_if_dilution_factor` | `Integer` | ✓ |  |  |  |  |  |
| `notes` | `Text` | ✓ |  |  |  |  |  |
| `is_favorite` | `Boolean` |  |  |  |  |  | `False` |
| `created_at` | `DateTime` | ✓ |  |  |  |  |  |
| `updated_at` | `DateTime` | ✓ |  |  |  |  |  |

**Relationships:**
- `fluorophore` → Fluorophore

### `ExperimentBlock` → table `experiment_blocks`

| Column | Type | Null | PK | Uniq | FK | ondelete | Default |
|---|---|---|---|---|---|---|---|
| `id` | `String(36)` |  | ✓ |  |  |  | `lambda: str(uuid.uuid4())` |
| `experiment_id` | `String(36)` |  |  |  | `experiments.id` | `CASCADE` |  |
| `block_type` | `String(30)` |  |  |  |  |  |  |
| `content` | `Text` |  |  |  |  |  | `'{}'` |
| `sort_order` | `Float` |  |  |  |  |  |  |
| `parent_id` | `String(36)` | ✓ |  |  | `experiment_blocks.id` | `SET NULL` |  |
| `created_at` | `DateTime` | ✓ |  |  |  |  |  |
| `updated_at` | `DateTime` | ✓ |  |  |  |  |  |

**Relationships:**
- `experiment` → Experiment back_populates=blocks
- `parent` → ExperimentBlock

## Resolved API Routes

| Verb | Path | Handler | Response model | Status |
|---|---|---|---|---|
| `GET` | `/api/v1/antibodies` | `antibodies.list_antibodies` | `PaginatedResponse[AntibodyRead]` |  |
| `POST` | `/api/v1/antibodies` | `antibodies.create_antibody` | `AntibodyRead` | 201 |
| `POST` | `/api/v1/antibodies/import-confirm` | `antibodies.import_confirm` | `ImportConfirmResponse` |  |
| `POST` | `/api/v1/antibodies/import-csv` | `antibodies.import_csv` | `CsvImportResponse` |  |
| `DELETE` | `/api/v1/antibodies/{id}` | `antibodies.delete_antibody` | `` | 204 |
| `GET` | `/api/v1/antibodies/{id}` | `antibodies.get_antibody` | `AntibodyRead` |  |
| `PUT` | `/api/v1/antibodies/{id}` | `antibodies.update_antibody` | `AntibodyRead` |  |
| `PATCH` | `/api/v1/antibodies/{id}/favorite` | `antibodies.toggle_favorite` | `AntibodyRead` |  |
| `POST` | `/api/v1/antibodies/{id}/tags` | `antibodies.assign_tags` | `AntibodyRead` |  |
| `DELETE` | `/api/v1/antibodies/{id}/tags/{tag_id}` | `antibodies.remove_tag` | `` | 204 |
| `GET` | `/api/v1/conjugate-chemistries` | `conjugate_chemistries.list_conjugate_chemistries` | `list[ConjugateChemistryRead]` |  |
| `POST` | `/api/v1/conjugate-chemistries` | `conjugate_chemistries.create_conjugate_chemistry` | `ConjugateChemistryRead` | 201 |
| `DELETE` | `/api/v1/conjugate-chemistries/{entry_id}` | `conjugate_chemistries.delete_conjugate_chemistry` | `` | 204 |
| `PUT` | `/api/v1/conjugate-chemistries/{entry_id}` | `conjugate_chemistries.update_conjugate_chemistry` | `ConjugateChemistryRead` |  |
| `GET` | `/api/v1/dye-labels` | `dye_labels.list_dye_labels` | `PaginatedResponse[DyeLabelResponse]` |  |
| `POST` | `/api/v1/dye-labels` | `dye_labels.create_dye_label` | `DyeLabelResponse` | 201 |
| `DELETE` | `/api/v1/dye-labels/{id}` | `dye_labels.delete_dye_label` | `` | 204 |
| `GET` | `/api/v1/dye-labels/{id}` | `dye_labels.get_dye_label` | `DyeLabelResponse` |  |
| `PUT` | `/api/v1/dye-labels/{id}` | `dye_labels.update_dye_label` | `DyeLabelResponse` |  |
| `PATCH` | `/api/v1/dye-labels/{id}/favorite` | `dye_labels.toggle_favorite` | `DyeLabelResponse` |  |
| `GET` | `/api/v1/experiments` | `experiments.list_experiments` | `PaginatedResponse[ExperimentListRead]` |  |
| `POST` | `/api/v1/experiments` | `experiments.create_experiment` | `ExperimentRead` | 201 |
| `DELETE` | `/api/v1/experiments/{id}` | `experiments.delete_experiment` | `` | 204 |
| `GET` | `/api/v1/experiments/{id}` | `experiments.get_experiment` | `ExperimentRead` |  |
| `PUT` | `/api/v1/experiments/{id}` | `experiments.update_experiment` | `ExperimentRead` |  |
| `POST` | `/api/v1/experiments/{id}/blocks` | `experiments.create_block` | `ExperimentBlockRead` | 201 |
| `PUT` | `/api/v1/experiments/{id}/blocks/reorder` | `experiments.reorder_blocks` | `ExperimentRead` |  |
| `DELETE` | `/api/v1/experiments/{id}/blocks/{block_id}` | `experiments.delete_block` | `` | 204 |
| `PUT` | `/api/v1/experiments/{id}/blocks/{block_id}` | `experiments.update_block` | `ExperimentBlockRead` |  |
| `POST` | `/api/v1/experiments/{id}/snapshot-panel` | `experiments.snapshot_panel` | `ExperimentBlockRead` | 201 |
| `GET` | `/api/v1/export/antibodies` | `export_import.export_antibodies` | `` |  |
| `GET` | `/api/v1/export/conjugate-chemistries` | `export_import.export_conjugate_chemistries` | `` |  |
| `GET` | `/api/v1/export/dye-labels` | `export_import.export_dye_labels` | `` |  |
| `GET` | `/api/v1/export/experiments` | `export_import.export_experiments` | `` |  |
| `GET` | `/api/v1/export/flow-panels` | `export_import.export_flow_panels` | `` |  |
| `GET` | `/api/v1/export/fluorophores` | `export_import.export_fluorophores` | `` |  |
| `GET` | `/api/v1/export/if-panels` | `export_import.export_if_panels` | `` |  |
| `GET` | `/api/v1/export/instruments` | `export_import.export_instruments` | `` |  |
| `GET` | `/api/v1/export/list-entries` | `export_import.export_list_entries` | `` |  |
| `GET` | `/api/v1/export/microscopes` | `export_import.export_microscopes` | `` |  |
| `GET` | `/api/v1/export/plate-maps` | `export_import.export_plate_maps` | `` |  |
| `GET` | `/api/v1/export/secondaries` | `export_import.export_secondaries` | `` |  |
| `GET` | `/api/v1/fluorophores` | `fluorophores.list_fluorophores` | `PaginatedResponse[FluorophoreRead]` |  |
| `POST` | `/api/v1/fluorophores` | `fluorophores.create_fluorophore` | `FluorophoreRead` | 201 |
| `POST` | `/api/v1/fluorophores/batch-fetch-fpbase` | `fluorophores.batch_fetch_fpbase_endpoint` | `BatchFetchFpbaseResult` |  |
| `POST` | `/api/v1/fluorophores/fetch-fpbase` | `fluorophores.fetch_fpbase_endpoint` | `FluorophoreRead` |  |
| `GET` | `/api/v1/fluorophores/fpbase-catalog` | `fluorophores.fpbase_catalog` | `list[FpbaseCatalogItem]` |  |
| `POST` | `/api/v1/fluorophores/import/confirm` | `fluorophores.confirm_fluorophore_import` | `FluorophoreImportConfirmResponse` |  |
| `POST` | `/api/v1/fluorophores/import/upload` | `fluorophores.upload_fluorophores_for_import` | `FluorophoreImportPreview` |  |
| `GET` | `/api/v1/fluorophores/recent` | `fluorophores.get_recent_fluorophores` | `list[str]` |  |
| `POST` | `/api/v1/fluorophores/spectra/batch` | `fluorophores.batch_spectra` | `` |  |
| `PATCH` | `/api/v1/fluorophores/{id}/favorite` | `fluorophores.toggle_fluorophore_favorite` | `` |  |
| `GET` | `/api/v1/fluorophores/{id}/instrument-compatibility` | `fluorophores.get_instrument_compatibility` | `InstrumentCompatibilityResponse` |  |
| `GET` | `/api/v1/fluorophores/{id}/microscope-compatibility` | `fluorophores.get_microscope_compatibility` | `MicroscopeCompatibilityResponse` |  |
| `GET` | `/api/v1/fluorophores/{id}/spectra` | `fluorophores.get_fluorophore_spectra` | `FluorophoreSpectraResponse` |  |
| `GET` | `/api/v1/if-panels` | `if_panels.list_if_panels` | `PaginatedResponse[IFPanelListRead]` |  |
| `POST` | `/api/v1/if-panels` | `if_panels.create_if_panel` | `IFPanelRead` | 201 |
| `DELETE` | `/api/v1/if-panels/{id}` | `if_panels.delete_if_panel` | `` | 204 |
| `GET` | `/api/v1/if-panels/{id}` | `if_panels.get_if_panel` | `IFPanelRead` |  |
| `PUT` | `/api/v1/if-panels/{id}` | `if_panels.update_if_panel` | `IFPanelRead` |  |
| `POST` | `/api/v1/if-panels/{id}/assignments` | `if_panels.add_assignment` | `IFPanelAssignmentRead` | 201 |
| `DELETE` | `/api/v1/if-panels/{id}/assignments/{assignment_id}` | `if_panels.remove_assignment` | `` | 204 |
| `POST` | `/api/v1/if-panels/{id}/targets` | `if_panels.add_target` | `IFPanelTargetRead` | 201 |
| `PUT` | `/api/v1/if-panels/{id}/targets/reorder` | `if_panels.reorder_targets` | `list[IFPanelTargetRead]` |  |
| `DELETE` | `/api/v1/if-panels/{id}/targets/{target_id}` | `if_panels.remove_target` | `` | 204 |
| `PUT` | `/api/v1/if-panels/{id}/targets/{target_id}` | `if_panels.update_target` | `IFPanelTargetRead` |  |
| `POST` | `/api/v1/import/antibodies` | `export_import.import_antibodies` | `` |  |
| `POST` | `/api/v1/import/antibodies/commit` | `export_import.import_antibodies_commit` | `` |  |
| `POST` | `/api/v1/import/antibodies/preview` | `export_import.import_antibodies_preview` | `` |  |
| `POST` | `/api/v1/import/conjugate-chemistries` | `export_import.import_conjugate_chemistries` | `` |  |
| `POST` | `/api/v1/import/conjugate-chemistries/commit` | `export_import.import_conjugate_chemistries_commit` | `` |  |
| `POST` | `/api/v1/import/conjugate-chemistries/preview` | `export_import.import_conjugate_chemistries_preview` | `` |  |
| `POST` | `/api/v1/import/dye-labels` | `export_import.import_dye_labels` | `` |  |
| `POST` | `/api/v1/import/dye-labels/commit` | `export_import.import_dye_labels_commit` | `` |  |
| `POST` | `/api/v1/import/dye-labels/preview` | `export_import.import_dye_labels_preview` | `` |  |
| `POST` | `/api/v1/import/experiments` | `export_import.import_experiments` | `` |  |
| `POST` | `/api/v1/import/experiments/commit` | `export_import.import_experiments_commit` | `` |  |
| `POST` | `/api/v1/import/experiments/preview` | `export_import.import_experiments_preview` | `` |  |
| `POST` | `/api/v1/import/flow-panels` | `export_import.import_flow_panels` | `` |  |
| `POST` | `/api/v1/import/flow-panels/commit` | `export_import.import_flow_panels_commit` | `` |  |
| `POST` | `/api/v1/import/flow-panels/preview` | `export_import.import_flow_panels_preview` | `` |  |
| `POST` | `/api/v1/import/fluorophores/commit` | `export_import.import_fluorophores_commit` | `` |  |
| `POST` | `/api/v1/import/fluorophores/preview` | `export_import.import_fluorophores_preview` | `` |  |
| `POST` | `/api/v1/import/if-panels` | `export_import.import_if_panels` | `` |  |
| `POST` | `/api/v1/import/if-panels/commit` | `export_import.import_if_panels_commit` | `` |  |
| `POST` | `/api/v1/import/if-panels/preview` | `export_import.import_if_panels_preview` | `` |  |
| `POST` | `/api/v1/import/instruments` | `export_import.import_instruments` | `` |  |
| `POST` | `/api/v1/import/instruments/commit` | `export_import.import_instruments_commit` | `` |  |
| `POST` | `/api/v1/import/instruments/preview` | `export_import.import_instruments_preview` | `` |  |
| `POST` | `/api/v1/import/list-entries` | `export_import.import_list_entries` | `` |  |
| `POST` | `/api/v1/import/list-entries/commit` | `export_import.import_list_entries_commit` | `` |  |
| `POST` | `/api/v1/import/list-entries/preview` | `export_import.import_list_entries_preview` | `` |  |
| `POST` | `/api/v1/import/microscopes` | `export_import.import_microscopes` | `` |  |
| `POST` | `/api/v1/import/microscopes/commit` | `export_import.import_microscopes_commit` | `` |  |
| `POST` | `/api/v1/import/microscopes/preview` | `export_import.import_microscopes_preview` | `` |  |
| `POST` | `/api/v1/import/plate-maps` | `export_import.import_plate_maps` | `` |  |
| `POST` | `/api/v1/import/plate-maps/commit` | `export_import.import_plate_maps_commit` | `` |  |
| `POST` | `/api/v1/import/plate-maps/preview` | `export_import.import_plate_maps_preview` | `` |  |
| `POST` | `/api/v1/import/secondaries` | `export_import.import_secondaries` | `` |  |
| `POST` | `/api/v1/import/secondaries/commit` | `export_import.import_secondaries_commit` | `` |  |
| `POST` | `/api/v1/import/secondaries/preview` | `export_import.import_secondaries_preview` | `` |  |
| `GET` | `/api/v1/instruments` | `instruments.list_instruments` | `PaginatedResponse[InstrumentRead]` |  |
| `POST` | `/api/v1/instruments` | `instruments.create_instrument` | `InstrumentRead` | 201 |
| `POST` | `/api/v1/instruments/import` | `instruments.import_instrument` | `InstrumentRead` | 201 |
| `GET` | `/api/v1/instruments/recent` | `instruments.get_recent_instruments` | `list[str]` |  |
| `DELETE` | `/api/v1/instruments/{id}` | `instruments.delete_instrument` | `` | 204 |
| `GET` | `/api/v1/instruments/{id}` | `instruments.get_instrument` | `InstrumentRead` |  |
| `PUT` | `/api/v1/instruments/{id}` | `instruments.update_instrument` | `InstrumentRead` |  |
| `GET` | `/api/v1/instruments/{id}/export` | `instruments.export_instrument` | `InstrumentExport` |  |
| `PATCH` | `/api/v1/instruments/{id}/favorite` | `instruments.toggle_instrument_favorite` | `InstrumentRead` |  |
| `GET` | `/api/v1/instruments/{id}/fluorophore-compatibility` | `instruments.get_fluorophore_compatibility` | `DetectorCompatibilityResponse` |  |
| `POST` | `/api/v1/instruments/{id}/view` | `instruments.record_instrument_view` | `` | 204 |
| `GET` | `/api/v1/list-entries/{list_type}` | `list_entries.get_list_entries` | `list[ListEntryRead]` |  |
| `POST` | `/api/v1/list-entries/{list_type}` | `list_entries.create_list_entry` | `ListEntryRead` | 201 |
| `DELETE` | `/api/v1/list-entries/{list_type}/{entry_id}` | `list_entries.delete_list_entry` | `` | 204 |
| `PUT` | `/api/v1/list-entries/{list_type}/{entry_id}` | `list_entries.update_list_entry` | `ListEntryRead` |  |
| `GET` | `/api/v1/microscopes` | `microscopes.list_microscopes` | `PaginatedResponse[MicroscopeRead]` |  |
| `POST` | `/api/v1/microscopes` | `microscopes.create_microscope` | `MicroscopeRead` | 201 |
| `POST` | `/api/v1/microscopes/import` | `microscopes.import_microscope` | `MicroscopeRead` | 201 |
| `GET` | `/api/v1/microscopes/recent` | `microscopes.get_recent_microscopes` | `list[str]` |  |
| `DELETE` | `/api/v1/microscopes/{id}` | `microscopes.delete_microscope` | `` | 204 |
| `GET` | `/api/v1/microscopes/{id}` | `microscopes.get_microscope` | `MicroscopeRead` |  |
| `PUT` | `/api/v1/microscopes/{id}` | `microscopes.update_microscope` | `MicroscopeRead` |  |
| `GET` | `/api/v1/microscopes/{id}/export` | `microscopes.export_microscope` | `MicroscopeExport` |  |
| `PATCH` | `/api/v1/microscopes/{id}/favorite` | `microscopes.toggle_microscope_favorite` | `MicroscopeRead` |  |
| `GET` | `/api/v1/microscopes/{id}/fluorophore-compatibility` | `microscopes.get_microscope_fluorophore_compatibility` | `DetectorCompatibilityResponse` |  |
| `POST` | `/api/v1/microscopes/{id}/view` | `microscopes.record_microscope_view` | `` | 204 |
| `GET` | `/api/v1/panels` | `panels.list_panels` | `PaginatedResponse[PanelListRead]` |  |
| `POST` | `/api/v1/panels` | `panels.create_panel` | `PanelRead` | 201 |
| `DELETE` | `/api/v1/panels/{id}` | `panels.delete_panel` | `` | 204 |
| `GET` | `/api/v1/panels/{id}` | `panels.get_panel` | `PanelRead` |  |
| `PUT` | `/api/v1/panels/{id}` | `panels.update_panel` | `PanelRead` |  |
| `POST` | `/api/v1/panels/{id}/assignments` | `panels.add_assignment` | `PanelAssignmentRead` | 201 |
| `DELETE` | `/api/v1/panels/{id}/assignments/{assignment_id}` | `panels.remove_assignment` | `` | 204 |
| `POST` | `/api/v1/panels/{id}/targets` | `panels.add_target` | `PanelTargetRead` | 201 |
| `PUT` | `/api/v1/panels/{id}/targets/reorder` | `panels.reorder_targets` | `list[PanelTargetRead]` |  |
| `DELETE` | `/api/v1/panels/{id}/targets/{target_id}` | `panels.remove_target` | `` | 204 |
| `PUT` | `/api/v1/panels/{id}/targets/{target_id}` | `panels.update_target` | `PanelTargetRead` |  |
| `GET` | `/api/v1/plate-maps` | `plate_maps.list_plate_maps` | `PaginatedResponse[PlateMapListRead]` |  |
| `POST` | `/api/v1/plate-maps` | `plate_maps.create_plate_map` | `PlateMapRead` | 201 |
| `DELETE` | `/api/v1/plate-maps/{id}` | `plate_maps.delete_plate_map` | `` | 204 |
| `GET` | `/api/v1/plate-maps/{id}` | `plate_maps.get_plate_map` | `PlateMapRead` |  |
| `PUT` | `/api/v1/plate-maps/{id}` | `plate_maps.update_plate_map` | `PlateMapRead` |  |
| `GET` | `/api/v1/preferences` | `preferences.get_preferences` | `dict[str, str]` |  |
| `PUT` | `/api/v1/preferences/{key}` | `preferences.update_preference` | `PreferenceRead` |  |
| `GET` | `/api/v1/secondary-antibodies` | `secondaries.list_secondary_antibodies` | `PaginatedResponse[SecondaryAntibodyResponse]` |  |
| `POST` | `/api/v1/secondary-antibodies` | `secondaries.create_secondary_antibody` | `SecondaryAntibodyResponse` | 201 |
| `POST` | `/api/v1/secondary-antibodies/import-confirm` | `secondaries.import_confirm` | `SecondaryImportConfirmResponse` |  |
| `POST` | `/api/v1/secondary-antibodies/import-csv` | `secondaries.import_csv` | `SecondaryImportResponse` |  |
| `DELETE` | `/api/v1/secondary-antibodies/{id}` | `secondaries.delete_secondary_antibody` | `` | 204 |
| `GET` | `/api/v1/secondary-antibodies/{id}` | `secondaries.get_secondary_antibody` | `SecondaryAntibodyResponse` |  |
| `PUT` | `/api/v1/secondary-antibodies/{id}` | `secondaries.update_secondary_antibody` | `SecondaryAntibodyResponse` |  |
| `GET` | `/api/v1/tags` | `tags.list_tags` | `list[TagWithCount]` |  |
| `POST` | `/api/v1/tags` | `tags.create_tag` | `TagRead` | 201 |
| `DELETE` | `/api/v1/tags/{id}` | `tags.delete_tag` | `` | 204 |
| `PUT` | `/api/v1/tags/{id}` | `tags.update_tag` | `TagRead` |  |

## Pydantic Schemas

### `PaginatedResponse` : Generic[T]

| Field | Type | Default |
|---|---|---|
| `items` | `list[T]` |  |
| `total` | `int` |  |
| `skip` | `int` |  |
| `limit` | `int` |  |

### `DetectorBase`

| Field | Type | Default |
|---|---|---|
| `filter_midpoint` | `int` |  |
| `filter_width` | `int` |  |
| `name` | `str | None` | `None` |

### `LaserBase`

| Field | Type | Default |
|---|---|---|
| `wavelength_nm` | `int` |  |
| `name` | `str` |  |

### `InstrumentBase`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `location` | `str | None` | `None` |

### `MicroscopeFilterBase`

| Field | Type | Default |
|---|---|---|
| `filter_midpoint` | `int` |  |
| `filter_width` | `int` |  |
| `name` | `str | None` | `None` |

### `MicroscopeLaserBase`

| Field | Type | Default |
|---|---|---|
| `wavelength_nm` | `int` |  |
| `name` | `str` |  |
| `excitation_type` | `str` | `'laser'` |
| `ex_filter_width` | `int | None` | `None` |

### `MicroscopeBase`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `location` | `str | None` | `None` |

### `FluorophoreRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `name` | `str` |  |
| `fluor_type` | `str | None` | `None` |
| `source` | `str` |  |
| `ex_max_nm` | `float | None` | `None` |
| `em_max_nm` | `float | None` | `None` |
| `ext_coeff` | `float | None` | `None` |
| `qy` | `float | None` | `None` |
| `lifetime_ns` | `float | None` | `None` |
| `oligomerization` | `str | None` | `None` |
| `switch_type` | `str | None` | `None` |
| `has_spectra` | `bool` |  |
| `is_favorite` | `bool` | `False` |

### `FluorophoreCreate`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `fluor_type` | `str | None` | `None` |
| `source` | `str` | `'user'` |
| `ex_max_nm` | `float | None` | `None` |
| `em_max_nm` | `float | None` | `None` |
| `ext_coeff` | `float | None` | `None` |
| `qy` | `float | None` | `None` |
| `lifetime_ns` | `float | None` | `None` |
| `oligomerization` | `str | None` | `None` |
| `switch_type` | `str | None` | `None` |

### `FluorophoreSpectraResponse`

| Field | Type | Default |
|---|---|---|
| `fluorophore_id` | `str` |  |
| `name` | `str` |  |
| `spectra` | `dict[str, list[list[float]]]` |  |

### `BatchSpectraRequest`

| Field | Type | Default |
|---|---|---|
| `ids` | `list[str]` |  |
| `types` | `list[str]` | `['EX', 'EM']` |

### `LaserCompatibility`

| Field | Type | Default |
|---|---|---|
| `wavelength_nm` | `int` |  |
| `excitation_efficiency` | `float` |  |

### `DetectorCompatibility`

| Field | Type | Default |
|---|---|---|
| `name` | `str | None` |  |
| `center_nm` | `int` |  |
| `bandwidth_nm` | `int` |  |
| `collection_efficiency` | `float` |  |
| `laser_wavelength_nm` | `int` |  |

### `InstrumentCompatibility`

| Field | Type | Default |
|---|---|---|
| `instrument_id` | `str` |  |
| `instrument_name` | `str` |  |
| `is_favorite` | `bool` | `False` |
| `laser_lines` | `list[LaserCompatibility]` |  |
| `detectors` | `list[DetectorCompatibility]` |  |

### `InstrumentCompatibilityResponse`

| Field | Type | Default |
|---|---|---|
| `fluorophore_id` | `str` |  |
| `instrument_compatibilities` | `list[InstrumentCompatibility]` |  |

### `MicroscopeCompatibility`

| Field | Type | Default |
|---|---|---|
| `microscope_id` | `str` |  |
| `microscope_name` | `str` |  |
| `is_favorite` | `bool` | `False` |
| `laser_lines` | `list[LaserCompatibility]` |  |
| `filters` | `list[DetectorCompatibility]` |  |

### `MicroscopeCompatibilityResponse`

| Field | Type | Default |
|---|---|---|
| `fluorophore_id` | `str` |  |
| `microscope_compatibilities` | `list[MicroscopeCompatibility]` |  |

### `ListEntryCreate`

| Field | Type | Default |
|---|---|---|
| `value` | `str` |  |

### `ListEntryUpdate`

| Field | Type | Default |
|---|---|---|
| `value` | `str` |  |

### `ListEntryRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `list_type` | `str` |  |
| `value` | `str` |  |
| `sort_order` | `int` |  |

### `ConjugateChemistryCreate`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `label` | `str` |  |

### `ConjugateChemistryUpdate`

| Field | Type | Default |
|---|---|---|
| `name` | `str | None` | `None` |
| `label` | `str | None` | `None` |

### `ConjugateChemistryRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `name` | `str` |  |
| `label` | `str` |  |
| `sort_order` | `int` |  |

### `PreferenceBase`

| Field | Type | Default |
|---|---|---|
| `value` | `str` |  |

### `FluorophoreCompatibilityDetail`

| Field | Type | Default |
|---|---|---|
| `fluorophore_id` | `str` |  |
| `name` | `str` |  |
| `excitation_efficiency` | `float` |  |
| `detection_efficiency` | `float` |  |
| `is_favorite` | `bool` |  |

### `DetectorCompatibilityResponse`

| Field | Type | Default |
|---|---|---|
| `instrument_id` | `str` |  |
| `min_excitation_pct` | `int` |  |
| `min_detection_pct` | `int` |  |
| `compatibility` | `dict[str, list[FluorophoreCompatibilityDetail]]` |  |

### `FetchFpbaseRequest`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |

### `BatchFetchFpbaseRequest`

| Field | Type | Default |
|---|---|---|
| `names` | `list[str]` |  |

### `BatchFetchFpbaseResult`

| Field | Type | Default |
|---|---|---|
| `fetched` | `list[FluorophoreRead]` |  |
| `errors` | `list[dict]` |  |

### `FluorophoreImportItem`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `fluor_type` | `str | None` | `None` |
| `ex_max_nm` | `float | None` | `None` |
| `em_max_nm` | `float | None` | `None` |
| `ext_coeff` | `float | None` | `None` |
| `qy` | `float | None` | `None` |
| `lifetime_ns` | `float | None` | `None` |
| `oligomerization` | `str | None` | `None` |
| `switch_type` | `str | None` | `None` |
| `spectra` | `dict[str, list[list[float]]] | None` | `None` |
| `row_number` | `int` | `0` |
| `warnings` | `list[str]` | `[]` |

### `FluorophoreImportDuplicate`

| Field | Type | Default |
|---|---|---|
| `row_number` | `int` |  |
| `name` | `str` |  |
| `existing_id` | `str` |  |

### `FluorophoreImportError`

| Field | Type | Default |
|---|---|---|
| `row_number` | `int` |  |
| `error` | `str` |  |
| `raw_data` | `dict | None` | `None` |

### `FluorophoreImportPreview`

| Field | Type | Default |
|---|---|---|
| `new_items` | `list[FluorophoreImportItem]` |  |
| `duplicates` | `list[FluorophoreImportDuplicate]` |  |
| `parse_errors` | `list[FluorophoreImportError]` |  |
| `format_detected` | `str` |  |
| `total_rows` | `int` |  |

### `FluorophoreImportConfirmRequest`

| Field | Type | Default |
|---|---|---|
| `items` | `list[FluorophoreImportItem]` |  |

### `FluorophoreImportConfirmResponse`

| Field | Type | Default |
|---|---|---|
| `created` | `int` |  |
| `skipped` | `int` |  |
| `errors` | `list[str]` |  |

### `FpbaseCatalogItem`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `id` | `str` |  |

### `TagCreate`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `color` | `str | None` | `None` |

### `TagRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `name` | `str` |  |
| `color` | `str | None` | `None` |

### `AntibodyBase`

| Field | Type | Default |
|---|---|---|
| `target` | `str` |  |
| `name` | `str | None` | `None` |
| `clone` | `str | None` | `None` |
| `host` | `str | None` | `None` |
| `isotype` | `str | None` | `None` |
| `fluorophore_id` | `str | None` | `None` |
| `conjugate` | `str | None` | `None` |
| `vendor` | `str | None` | `None` |
| `catalog_number` | `str | None` | `None` |
| `confirmed_in_stock` | `bool` | `False` |
| `date_received` | `str | None` | `None` |
| `flow_dilution` | `str | None` | `None` |
| `icc_if_dilution` | `str | None` | `None` |
| `wb_dilution` | `str | None` | `None` |
| `flow_dilution_factor` | `int | None` | `None` |
| `icc_if_dilution_factor` | `int | None` | `None` |
| `wb_dilution_factor` | `int | None` | `None` |
| `reacts_with` | `list[str] | None` | `None` |
| `storage_temp` | `str | None` | `None` |
| `validation_notes` | `str | None` | `None` |
| `notes` | `str | None` | `None` |
| `website` | `str | None` | `None` |
| `physical_location` | `str | None` | `None` |

### `FavoriteToggle`

| Field | Type | Default |
|---|---|---|
| `is_favorite` | `bool` |  |

### `ParsedAntibody`

| Field | Type | Default |
|---|---|---|
| `name` | `str | None` | `None` |
| `catalog_number` | `str | None` | `None` |
| `conjugate` | `str | None` | `None` |
| `host_species` | `str | None` | `None` |
| `isotype` | `str | None` | `None` |
| `manufacturer` | `str | None` | `None` |
| `confirmed_in_stock` | `bool` | `False` |
| `date_received` | `str | None` | `None` |
| `flow_dilution` | `str | None` | `None` |
| `icc_if_dilution` | `str | None` | `None` |
| `wb_dilution` | `str | None` | `None` |
| `reacts_with` | `list[str]` | `[]` |
| `storage_temp` | `str | None` | `None` |
| `validation_notes` | `str | None` | `None` |
| `notes` | `str | None` | `None` |
| `website` | `str | None` | `None` |
| `physical_location` | `str | None` | `None` |

### `NewAntibodyRow`

| Field | Type | Default |
|---|---|---|
| `csv_row_index` | `int` |  |
| `parsed` | `ParsedAntibody` |  |
| `missing_fields` | `list[str]` | `[]` |
| `warnings` | `list[str]` | `[]` |

### `ExistingAntibodyRow`

| Field | Type | Default |
|---|---|---|
| `csv_row_index` | `int` |  |
| `name` | `str | None` | `None` |
| `catalog_number` | `str | None` | `None` |
| `existing_id` | `str` |  |

### `ParseErrorRow`

| Field | Type | Default |
|---|---|---|
| `csv_row_index` | `int` |  |
| `raw_row` | `dict` |  |
| `error` | `str` |  |

### `ImportSummary`

| Field | Type | Default |
|---|---|---|
| `total_csv_rows` | `int` |  |
| `new` | `int` |  |
| `existing` | `int` |  |
| `errors` | `int` |  |

### `CsvImportResponse`

| Field | Type | Default |
|---|---|---|
| `new_antibodies` | `list[NewAntibodyRow]` |  |
| `already_exists` | `list[ExistingAntibodyRow]` |  |
| `parse_errors` | `list[ParseErrorRow]` |  |
| `summary` | `ImportSummary` |  |

### `ImportAntibodyItem`

| Field | Type | Default |
|---|---|---|
| `name` | `str | None` | `None` |
| `target` | `str | None` | `None` |
| `catalog_number` | `str | None` | `None` |
| `conjugate` | `str | None` | `None` |
| `host` | `str | None` | `None` |
| `isotype` | `str | None` | `None` |
| `vendor` | `str | None` | `None` |
| `confirmed_in_stock` | `bool` | `False` |
| `date_received` | `str | None` | `None` |
| `flow_dilution` | `str | None` | `None` |
| `icc_if_dilution` | `str | None` | `None` |
| `wb_dilution` | `str | None` | `None` |
| `reacts_with` | `list[str]` | `[]` |
| `storage_temp` | `str | None` | `None` |
| `validation_notes` | `str | None` | `None` |
| `notes` | `str | None` | `None` |
| `website` | `str | None` | `None` |
| `physical_location` | `str | None` | `None` |

### `ImportConfirmRequest`

| Field | Type | Default |
|---|---|---|
| `antibodies` | `list[ImportAntibodyItem]` |  |

### `ImportConfirmResponse`

| Field | Type | Default |
|---|---|---|
| `imported` | `int` |  |
| `errors` | `list[dict]` |  |

### `TagAssignRequest`

| Field | Type | Default |
|---|---|---|
| `tag_ids` | `list[str]` |  |

### `SecondaryAntibodyCreate`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `host` | `str` |  |
| `target_species` | `str` |  |
| `target_isotype` | `str | None` | `None` |
| `binding_mode` | `str` | `'species'` |
| `target_conjugate` | `str | None` | `None` |
| `fluorophore_id` | `str | None` | `None` |
| `vendor` | `str | None` | `None` |
| `catalog_number` | `str | None` | `None` |
| `lot_number` | `str | None` | `None` |
| `notes` | `str | None` | `None` |

### `SecondaryImportItem`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `host` | `str` |  |
| `target_species` | `str` |  |
| `target_isotype` | `str | None` | `None` |
| `binding_mode` | `str` | `'species'` |
| `target_conjugate` | `str | None` | `None` |
| `fluorophore_name` | `str | None` | `None` |
| `fluorophore_id` | `str | None` | `None` |
| `vendor` | `str | None` | `None` |
| `catalog_number` | `str | None` | `None` |
| `lot_number` | `str | None` | `None` |
| `warnings` | `list[str]` | `[]` |
| `row_number` | `int` |  |

### `SecondaryImportResponse`

| Field | Type | Default |
|---|---|---|
| `items` | `list[SecondaryImportItem]` |  |
| `total_rows` | `int` |  |
| `valid_rows` | `int` |  |
| `warning_count` | `int` |  |

### `SecondaryImportConfirmRequest`

| Field | Type | Default |
|---|---|---|
| `items` | `list[SecondaryImportItem]` |  |

### `SecondaryImportConfirmResponse`

| Field | Type | Default |
|---|---|---|
| `created` | `int` |  |
| `skipped` | `int` |  |
| `errors` | `list[str]` |  |

### `SecondaryAntibodyResponse`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `name` | `str` |  |
| `host` | `str` |  |
| `target_species` | `str` |  |
| `target_isotype` | `str | None` |  |
| `binding_mode` | `str` |  |
| `target_conjugate` | `str | None` |  |
| `fluorophore_id` | `str | None` |  |
| `fluorophore_name` | `str | None` | `None` |
| `vendor` | `str | None` |  |
| `catalog_number` | `str | None` |  |
| `lot_number` | `str | None` |  |
| `notes` | `str | None` |  |
| `created_at` | `datetime` |  |
| `updated_at` | `datetime` |  |

### `PanelTargetCreate`

| Field | Type | Default |
|---|---|---|
| `antibody_id` | `str | None` | `None` |
| `dye_label_id` | `str | None` | `None` |
| `staining_mode` | `str` | `'direct'` |
| `secondary_antibody_id` | `str | None` | `None` |

### `PanelTargetUpdate`

| Field | Type | Default |
|---|---|---|
| `antibody_id` | `str | None` | `None` |
| `dye_label_id` | `str | None` | `None` |
| `staining_mode` | `str | None` | `None` |
| `secondary_antibody_id` | `str | None` | `None` |

### `PanelTargetReorder`

| Field | Type | Default |
|---|---|---|
| `target_ids` | `list[str]` |  |

### `PanelTargetRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `panel_id` | `str` |  |
| `antibody_id` | `str | None` |  |
| `dye_label_id` | `str | None` | `None` |
| `dye_label_name` | `str | None` | `None` |
| `dye_label_target` | `str | None` | `None` |
| `dye_label_fluorophore_id` | `str | None` | `None` |
| `dye_label_fluorophore_name` | `str | None` | `None` |
| `staining_mode` | `str` |  |
| `secondary_antibody_id` | `str | None` |  |
| `sort_order` | `int` |  |
| `antibody_name` | `str | None` | `None` |
| `antibody_target` | `str | None` | `None` |
| `secondary_antibody_name` | `str | None` | `None` |
| `secondary_fluorophore_id` | `str | None` | `None` |
| `secondary_fluorophore_name` | `str | None` | `None` |

### `PanelAssignmentCreate`

| Field | Type | Default |
|---|---|---|
| `antibody_id` | `str | None` | `None` |
| `dye_label_id` | `str | None` | `None` |
| `fluorophore_id` | `str` |  |
| `detector_id` | `str` |  |
| `notes` | `str | None` | `None` |

### `PanelAssignmentRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `panel_id` | `str` |  |
| `antibody_id` | `str | None` | `None` |
| `dye_label_id` | `str | None` | `None` |
| `fluorophore_id` | `str` |  |
| `detector_id` | `str` |  |
| `notes` | `str | None` | `None` |

### `PanelBase`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `instrument_id` | `str | None` | `None` |

### `IFPanelTargetCreate`

| Field | Type | Default |
|---|---|---|
| `antibody_id` | `str | None` | `None` |
| `dye_label_id` | `str | None` | `None` |
| `staining_mode` | `str` | `'direct'` |
| `secondary_antibody_id` | `str | None` | `None` |
| `dilution_override` | `str | None` | `None` |

### `IFPanelTargetUpdate`

| Field | Type | Default |
|---|---|---|
| `antibody_id` | `str | None` | `None` |
| `dye_label_id` | `str | None` | `None` |
| `staining_mode` | `str | None` | `None` |
| `secondary_antibody_id` | `str | None` | `None` |
| `dilution_override` | `str | None` | `None` |

### `IFPanelTargetReorder`

| Field | Type | Default |
|---|---|---|
| `target_ids` | `list[str]` |  |

### `IFPanelTargetRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `panel_id` | `str` |  |
| `antibody_id` | `str | None` |  |
| `dye_label_id` | `str | None` | `None` |
| `dye_label_name` | `str | None` | `None` |
| `dye_label_target` | `str | None` | `None` |
| `dye_label_fluorophore_id` | `str | None` | `None` |
| `dye_label_fluorophore_name` | `str | None` | `None` |
| `staining_mode` | `str` |  |
| `secondary_antibody_id` | `str | None` |  |
| `sort_order` | `int` |  |
| `antibody_name` | `str | None` | `None` |
| `antibody_target` | `str | None` | `None` |
| `secondary_antibody_name` | `str | None` | `None` |
| `secondary_fluorophore_id` | `str | None` | `None` |
| `secondary_fluorophore_name` | `str | None` | `None` |
| `dilution_override` | `str | None` | `None` |
| `antibody_icc_if_dilution` | `str | None` | `None` |

### `IFPanelAssignmentCreate`

| Field | Type | Default |
|---|---|---|
| `antibody_id` | `str | None` | `None` |
| `dye_label_id` | `str | None` | `None` |
| `fluorophore_id` | `str` |  |
| `filter_id` | `str | None` | `None` |
| `notes` | `str | None` | `None` |

### `IFPanelAssignmentRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `panel_id` | `str` |  |
| `antibody_id` | `str | None` | `None` |
| `dye_label_id` | `str | None` | `None` |
| `fluorophore_id` | `str` |  |
| `filter_id` | `str | None` | `None` |
| `notes` | `str | None` | `None` |

### `IFPanelBase`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `panel_type` | `str` | `'IF'` |
| `microscope_id` | `str | None` | `None` |
| `view_mode` | `str` | `'simple'` |

### `IFPanelUpdate`

| Field | Type | Default |
|---|---|---|
| `name` | `str | None` | `None` |
| `panel_type` | `str | None` | `None` |
| `microscope_id` | `str | None` | `None` |
| `view_mode` | `str | None` | `None` |

### `PlateMapCreate`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `description` | `str | None` | `None` |
| `plate_type` | `str` | `'96-well'` |
| `well_data` | `dict` | `{}` |
| `legend` | `dict` | `{}` |

### `PlateMapUpdate`

| Field | Type | Default |
|---|---|---|
| `name` | `str | None` | `None` |
| `description` | `str | None` | `None` |
| `plate_type` | `str | None` | `None` |
| `well_data` | `dict | None` | `None` |
| `legend` | `dict | None` | `None` |

### `PlateMapRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `name` | `str` |  |
| `description` | `str | None` |  |
| `plate_type` | `str` |  |
| `well_data` | `dict` |  |
| `legend` | `dict` |  |
| `created_at` | `datetime | None` | `None` |
| `updated_at` | `datetime | None` | `None` |

### `PlateMapListRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `name` | `str` |  |
| `description` | `str | None` |  |
| `plate_type` | `str` |  |
| `created_at` | `datetime | None` | `None` |
| `updated_at` | `datetime | None` | `None` |

### `ExperimentBlockCreate`

| Field | Type | Default |
|---|---|---|
| `block_type` | `str` |  |
| `content` | `dict` | `{}` |
| `sort_order` | `float` |  |
| `parent_id` | `str | None` | `None` |

### `ExperimentBlockUpdate`

| Field | Type | Default |
|---|---|---|
| `block_type` | `str | None` | `None` |
| `content` | `dict | None` | `None` |
| `sort_order` | `float | None` | `None` |
| `parent_id` | `str | None` | `None` |

### `ExperimentBlockRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `experiment_id` | `str` |  |
| `block_type` | `str` |  |
| `content` | `dict` |  |
| `sort_order` | `float` |  |
| `parent_id` | `str | None` |  |
| `created_at` | `datetime | None` | `None` |
| `updated_at` | `datetime | None` | `None` |

### `ExperimentBlockReorderItem`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `sort_order` | `float` |  |
| `parent_id` | `str | None` | `None` |

### `ExperimentBlockReorder`

| Field | Type | Default |
|---|---|---|
| `blocks` | `list[ExperimentBlockReorderItem]` |  |

### `ExperimentCreate`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `description` | `str | None` | `None` |

### `ExperimentUpdate`

| Field | Type | Default |
|---|---|---|
| `name` | `str | None` | `None` |
| `description` | `str | None` | `None` |

### `ExperimentRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `name` | `str` |  |
| `description` | `str | None` |  |
| `created_at` | `datetime | None` | `None` |
| `updated_at` | `datetime | None` | `None` |
| `blocks` | `list[ExperimentBlockRead]` | `[]` |

### `ExperimentListRead`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `name` | `str` |  |
| `description` | `str | None` |  |
| `created_at` | `datetime | None` | `None` |
| `updated_at` | `datetime | None` | `None` |
| `block_count` | `int` | `0` |

### `SnapshotPanelRequest`

| Field | Type | Default |
|---|---|---|
| `source_panel_id` | `str` |  |
| `panel_type` | `str` |  |

### `DyeLabelCreate`

| Field | Type | Default |
|---|---|---|
| `name` | `str` |  |
| `label_target` | `str` |  |
| `category` | `str | None` | `None` |
| `fluorophore_id` | `str | None` | `None` |
| `vendor` | `str | None` | `None` |
| `catalog_number` | `str | None` | `None` |
| `lot_number` | `str | None` | `None` |
| `flow_dilution` | `str | None` | `None` |
| `icc_if_dilution` | `str | None` | `None` |
| `notes` | `str | None` | `None` |

### `DyeLabelResponse`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `name` | `str` |  |
| `label_target` | `str` |  |
| `category` | `str | None` |  |
| `fluorophore_id` | `str | None` |  |
| `fluorophore_name` | `str | None` | `None` |
| `vendor` | `str | None` |  |
| `catalog_number` | `str | None` |  |
| `lot_number` | `str | None` |  |
| `flow_dilution` | `str | None` |  |
| `icc_if_dilution` | `str | None` |  |
| `flow_dilution_factor` | `int | None` |  |
| `icc_if_dilution_factor` | `int | None` |  |
| `notes` | `str | None` |  |
| `is_favorite` | `bool` |  |
| `created_at` | `datetime` |  |
| `updated_at` | `datetime` |  |

### `FluorophoreExportItem`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `name` | `str` |  |
| `fluor_type` | `str | None` | `None` |
| `source` | `str` |  |
| `ex_max_nm` | `float | None` | `None` |
| `em_max_nm` | `float | None` | `None` |
| `ext_coeff` | `float | None` | `None` |
| `qy` | `float | None` | `None` |
| `lifetime_ns` | `float | None` | `None` |
| `oligomerization` | `str | None` | `None` |
| `switch_type` | `str | None` | `None` |
| `has_spectra` | `bool` |  |
| `is_favorite` | `bool` |  |
| `spectra` | `dict[str, list[list[float]]]` | `{}` |

### `FluorophoreExportResponse`

| Field | Type | Default |
|---|---|---|
| `fluorophores` | `list[FluorophoreExportItem]` |  |
| `total` | `int` |  |
| `exported_at` | `str` |  |

### `FluorophoreImportSummaryItem`

| Field | Type | Default |
|---|---|---|
| `id` | `str` |  |
| `name` | `str` |  |
| `status` | `str` |  |
| `conflict_reason` | `str | None` | `None` |

### `FluorophoreImportPreviewResponse`

| Field | Type | Default |
|---|---|---|
| `new_count` | `int` |  |
| `id_conflict_count` | `int` |  |
| `name_conflict_count` | `int` |  |
| `items` | `list[FluorophoreImportSummaryItem]` |  |

### `FluorophoreImportCommitRequest`

| Field | Type | Default |
|---|---|---|
| `fluorophores` | `list[FluorophoreExportItem]` |  |

### `FluorophoreImportCommitResponse`

| Field | Type | Default |
|---|---|---|
| `created` | `int` |  |
| `skipped` | `int` |  |
| `errors` | `list[str]` |  |

