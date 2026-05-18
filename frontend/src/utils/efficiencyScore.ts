import { interpolateAt } from '@/utils/spectra'

/**
 * Frontend efficiency-score computation that mirrors the backend's
 * `routers/microscopes.py::get_microscope_fluorophore_compatibility`
 * math (which in turn uses `services/spectra.py::interpolate_at` and
 * `integrate_bandpass`).
 *
 * Why this lives separately from `utils/spectra.ts`:
 * - The existing `excitationEfficiency` / `detectionEfficiency` there
 *   bake in a 5% noise floor and a Gaussian fallback. Those are
 *   correct for the flow panel designer's auto-suggest ranking,
 *   but they don't match the backend compat endpoint's numbers.
 * - The IF panel chip display reads raw efficiency values for a
 *   specific (fluorophore, filter) pair the user picked. It needs
 *   to match the backend math byte-for-byte so the chip number
 *   doesn't drift from anything else in the app that asks the
 *   backend for the same combo.
 *
 * The phase-2 fix-up decouples chip display from the backend compat
 * endpoint (which is now reserved for threshold-gated auto-suggest
 * consumers) by computing locally from cached spectra. See
 * `plans/diagnostics/phase-2-if-bugs.md` for context.
 */

export type SpectrumPoints = number[][]

export interface ExcitationSource {
  laser_wavelength_nm: number
  excitation_type?: 'laser' | 'arc' | string
  ex_filter_width?: number | null
}

/**
 * Excitation efficiency in [0, 1].
 *
 * Mirrors backend `microscopes.py:333-357`. For arc lamps with an
 * `ex_filter_width`, integrates excitation over the bandpass and
 * divides by the full-range integral. For lasers (or arc lamps
 * without a filter width), uses point interpolation at the laser
 * wavelength divided by peak intensity.
 *
 * Fallback when spectrum is missing: returns 1.0 if `ex_max_nm` is
 * within ±40nm of the laser (or within ±half the ex_filter_width for
 * arc lamps), else 0. Returns 0 if both spectrum and `ex_max_nm` are
 * missing.
 */
export function excitationEfficiency(
  ex_spectrum: SpectrumPoints | null | undefined,
  ex_max_nm: number | null | undefined,
  source: ExcitationSource,
): number {
  const is_arc = source.excitation_type === 'arc'
  const filter_width = source.ex_filter_width ?? 0
  const laser_wl = source.laser_wavelength_nm

  if (is_arc && filter_width > 0) {
    if (ex_spectrum && ex_spectrum.length > 0) {
      const peak = Math.max(...ex_spectrum.map((p) => p[1]))
      if (peak <= 0) return 0
      const low = laser_wl - filter_width / 2
      const high = laser_wl + filter_width / 2
      const ex_passband = integrate_bandpass(ex_spectrum, low, high)
      const full_range = integrate_bandpass(
        ex_spectrum,
        ex_spectrum[0][0],
        ex_spectrum[ex_spectrum.length - 1][0],
      )
      if (full_range <= 0) return 0
      return ex_passband / full_range
    }
    if (ex_max_nm != null && Math.abs(ex_max_nm - laser_wl) <= filter_width / 2) {
      return 1.0
    }
    return 0
  }

  if (ex_spectrum && ex_spectrum.length > 0) {
    const peak = Math.max(...ex_spectrum.map((p) => p[1]))
    if (peak <= 0) return 0
    return interpolateAt(ex_spectrum, laser_wl) / peak
  }
  if (ex_max_nm != null && Math.abs(ex_max_nm - laser_wl) <= 40) {
    return 1.0
  }
  return 0
}

/**
 * Detection (collection) efficiency in [0, 1].
 *
 * Mirrors backend `microscopes.py:362-375`. Integrates emission over
 * the filter bandpass and divides by the full-range integral.
 *
 * Fallback when spectrum is missing: returns 1.0 if `em_max_nm` is
 * within ±filter_width of the filter midpoint (a generous 2× window,
 * matching backend), else 0.
 */
export function detectionEfficiency(
  em_spectrum: SpectrumPoints | null | undefined,
  em_max_nm: number | null | undefined,
  filter_midpoint: number,
  filter_width: number,
): number {
  if (em_spectrum && em_spectrum.length > 0) {
    const em_total = integrate_bandpass(
      em_spectrum,
      em_spectrum[0][0],
      em_spectrum[em_spectrum.length - 1][0],
    )
    if (em_total <= 0) return 0
    const low = filter_midpoint - filter_width / 2
    const high = filter_midpoint + filter_width / 2
    return integrate_bandpass(em_spectrum, low, high) / em_total
  }
  if (em_max_nm != null) {
    if (
      filter_midpoint - filter_width <= em_max_nm &&
      em_max_nm <= filter_midpoint + filter_width
    ) {
      return 1.0
    }
  }
  return 0
}

/**
 * Numerical integration at 1nm steps. Mirrors backend
 * `services/spectra.py::integrate_bandpass`. The loop starts at
 * `low` (not Math.round(low)) so the step boundaries align exactly
 * with the backend's `wl = low; wl += 1.0` formulation.
 */
function integrate_bandpass(
  spectrum: SpectrumPoints,
  low: number,
  high: number,
): number {
  let total = 0
  let wl = low
  while (wl <= high) {
    total += interpolateAt(spectrum, wl)
    wl += 1
  }
  return total
}
