import type { Antibody, IFPanelTarget, IFPanelAssignmentCreate } from '@/types'

/**
 * For an IF panel target, compute the assignment payload that should be
 * created automatically when the target's fluorophore is determined by
 * its data (dye-label with seeded fluorophore, or pre-conjugated antibody).
 *
 * Returns null when the target is user-selectable (unconjugated antibody,
 * indirect staining, dye label without fluorophore_id) — those require
 * explicit user input.
 *
 * Used both by onAddTarget (initial auto-assign) and by onMicroscopeChange
 * (re-create assignments wiped by the backend cascade — see #4 fix).
 */
export function computeAutoAssignPayload(
  target: IFPanelTarget,
  antibodies: Antibody[],
): IFPanelAssignmentCreate | null {
  if (target.dye_label_id && target.dye_label_fluorophore_id) {
    return {
      dye_label_id: target.dye_label_id,
      fluorophore_id: target.dye_label_fluorophore_id,
      filter_id: null,
    }
  }
  if (target.antibody_id) {
    const ab = antibodies.find((a) => a.id === target.antibody_id)
    if (ab?.fluorophore_id) {
      return {
        antibody_id: target.antibody_id,
        fluorophore_id: ab.fluorophore_id,
        filter_id: null,
      }
    }
  }
  return null
}
