from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import FluorophoreSpectrum


def interpolate_at(spectra: list[tuple], wavelength: float) -> float:
    """Linear interpolation on a sorted list of (wavelength, intensity) tuples."""
    if not spectra:
        return 0.0
    if wavelength <= spectra[0][0]:
        return spectra[0][1] if wavelength == spectra[0][0] else 0.0
    if wavelength >= spectra[-1][0]:
        return spectra[-1][1] if wavelength == spectra[-1][0] else 0.0
    lo = 0
    hi = len(spectra) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if spectra[mid][0] <= wavelength:
            lo = mid
        else:
            hi = mid
    x0, y0 = spectra[lo]
    x1, y1 = spectra[hi]
    t = (wavelength - x0) / (x1 - x0)
    return y0 + (y1 - y0) * t


def integrate_bandpass(
    spectra: list[tuple], low: float, high: float, step: float = 1.0
) -> float:
    """Numerical integration of spectra over [low, high] at 1nm steps."""
    total = 0.0
    wl = low
    while wl <= high:
        total += interpolate_at(spectra, wl)
        wl += step
    return total


def load_spectra_for(
    fluorophore_id: str,
    types: list[str],
    db: Session,
) -> dict[str, list[tuple]]:
    """Return {spectrum_type: sorted[(wavelength, intensity)]} for a fluorophore."""
    rows = db.execute(
        select(
            FluorophoreSpectrum.spectrum_type,
            FluorophoreSpectrum.wavelength_nm,
            FluorophoreSpectrum.intensity,
        )
        .where(FluorophoreSpectrum.fluorophore_id == fluorophore_id)
        .where(FluorophoreSpectrum.spectrum_type.in_(types))
        .order_by(
            FluorophoreSpectrum.spectrum_type,
            FluorophoreSpectrum.wavelength_nm,
        )
    ).all()

    result: dict[str, list[tuple]] = {}
    for stype, wl, intensity in rows:
        result.setdefault(stype, []).append((wl, intensity))
    return result
