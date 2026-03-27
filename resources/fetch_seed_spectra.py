#!/usr/bin/env python3
"""
Fetch real fluorophore spectra from FPbase and write seed JSON.

Run this LOCALLY before starting Claude Code sessions.
FPbase is not reachable from Claude Code's network sandbox.

Usage:
    pip install fpbase httpx
    python fetch_seed_spectra.py

Output:
    fluorophores.json  — ready to copy into backend/seed_data/
"""

import json
import sys
import math
import uuid
from pathlib import Path

try:
    import fpbase as fpb
except ImportError:
    print("ERROR: fpbasepy not installed. Run: pip install fpbase")
    sys.exit(1)


# ── Fluorophore registry ──────────────────────────────────────────────
# (name_in_fpbase, display_name, fallback_ex_max, fallback_em_max)
# FPbase names may differ from common usage — this maps both.
FLUOROPHORES = [
    # Brilliant Violet series
    ("BV421", "BV421", 405, 421),
    ("BV510", "BV510", 405, 510),
    ("BV605", "BV605", 405, 605),
    ("BV650", "BV650", 405, 650),
    ("BV711", "BV711", 405, 711),
    ("BV786", "BV786", 405, 786),
    # Classic dyes
    ("FITC", "FITC", 494, 519),
    ("PerCP", "PerCP", 482, 678),
    ("PerCP-Cy5.5", "PerCP-Cy5.5", 482, 695),
    ("BB515", "BB515", 490, 515),
    # PE and tandems
    ("PE", "PE", 565, 575),
    ("PE-Cy5", "PE-Cy5", 565, 667),
    ("PE-Cy5.5", "PE-Cy5.5", 565, 694),
    ("PE-Cy7", "PE-Cy7", 565, 785),
    ("PE-Dazzle 594", "PE-Dazzle594", 565, 610),
    # APC and tandems
    ("APC", "APC", 650, 660),
    ("APC-Cy7", "APC-Cy7", 650, 785),
    ("APC-R700", "APC-R700", 650, 700),
    # Alexa Fluor series
    ("Alexa Fluor 350", "AF350", 346, 442),
    ("Alexa Fluor 405", "AF405", 401, 421),
    ("Alexa Fluor 430", "AF430", 433, 539),
    ("Alexa Fluor 488", "AF488", 496, 519),
    ("Alexa Fluor 514", "AF514", 518, 540),
    ("Alexa Fluor 532", "AF532", 531, 554),
    ("Alexa Fluor 546", "AF546", 556, 573),
    ("Alexa Fluor 555", "AF555", 555, 565),
    ("Alexa Fluor 568", "AF568", 578, 603),
    ("Alexa Fluor 594", "AF594", 590, 617),
    ("Alexa Fluor 610", "AF610", 612, 628),
    ("Alexa Fluor 633", "AF633", 632, 647),
    ("Alexa Fluor 647", "AF647", 650, 668),
    ("Alexa Fluor 660", "AF660", 663, 690),
    ("Alexa Fluor 680", "AF680", 679, 702),
    ("Alexa Fluor 700", "AF700", 696, 719),
    ("Alexa Fluor 750", "AF750", 749, 775),
    ("Alexa Fluor 790", "AF790", 782, 804),
    # Alexa Fluor Plus (Thermo Fisher — may not be in FPbase)
    ("Alexa Fluor Plus 405", "AF Plus 405", 401, 421),
    ("Alexa Fluor Plus 488", "AF Plus 488", 498, 520),
    ("Alexa Fluor Plus 555", "AF Plus 555", 555, 580),
    ("Alexa Fluor Plus 594", "AF Plus 594", 591, 614),
    ("Alexa Fluor Plus 647", "AF Plus 647", 650, 665),
    ("Alexa Fluor Plus 680", "AF Plus 680", 680, 701),
    ("Alexa Fluor Plus 750", "AF Plus 750", 750, 775),
    ("Alexa Fluor Plus 800", "AF Plus 800", 782, 804),
    # Viability dyes
    ("DAPI", "DAPI", 359, 461),
    ("7-AAD", "7-AAD", 546, 647),
    ("Propidium Iodide", "PI", 535, 617),
    # Hoechst
    ("Hoechst 33342", "Hoechst 33342", 350, 461),
]


def gaussian_spectrum(peak_nm, sigma_nm, range_start=300, range_end=850):
    """Generate a Gaussian spectrum as [[wavelength, intensity], ...]."""
    points = []
    for lam in range(range_start, range_end + 1, 1):
        intensity = math.exp(-0.5 * ((lam - peak_nm) / sigma_nm) ** 2)
        if intensity > 0.001:
            points.append([lam, round(intensity, 4)])
    return points


def make_gaussian_fallback(ex_max, em_max):
    """Create approximate Gaussian spectra for a fluorophore."""
    # Excitation is typically narrower than emission
    ex_sigma = max(20, (em_max - ex_max) * 0.6) if em_max > ex_max else 25
    em_sigma = max(25, (em_max - ex_max) * 0.8) if em_max > ex_max else 30
    return {
        "excitation": gaussian_spectrum(ex_max, ex_sigma),
        "emission": gaussian_spectrum(em_max, em_sigma),
    }


def fetch_from_fpbase(fpbase_name):
    """
    Attempt to fetch fluorophore from FPbase.
    Returns (ex_max, em_max, spectra_dict) or None on failure.
    """
    try:
        fluor = fpb.get_fluorophore(fpbase_name)
    except Exception as exc:
        print("  FPbase lookup failed: %s" % exc)
        return None

    state = fluor.default_state
    if state is None:
        print("  No default state")
        return None

    ex_max = int(state.exMax) if state.exMax else None
    em_max = int(state.emMax) if state.emMax else None

    # Extract spectra data
    ex_data = None
    em_data = None
    for spec in (state.spectra or []):
        if spec.subtype in ("EX", "AB"):
            try:
                # fpbasepy Spectrum objects have a .data property
                # that returns the wavelength/intensity pairs
                raw = fpb.get_fluorophore(fpbase_name)
                # Need to fetch the actual data points via graphql
                result = fpb.graphql_query("""
                    query {
                        spectrum(id: %d) {
                            data
                        }
                    }
                """ % spec.id)
                data_str = result.get("spectrum", {}).get("data", "")
                if data_str:
                    # FPbase returns data as comma-separated pairs
                    pairs = []
                    for pair in data_str.split(","):
                        parts = pair.strip().split()
                        if len(parts) == 2:
                            pairs.append([float(parts[0]), float(parts[1])])
                    if pairs:
                        ex_data = pairs
            except Exception as exc:
                print("  Could not fetch EX spectrum data: %s" % exc)

        elif spec.subtype == "EM":
            try:
                result = fpb.graphql_query("""
                    query {
                        spectrum(id: %d) {
                            data
                        }
                    }
                """ % spec.id)
                data_str = result.get("spectrum", {}).get("data", "")
                if data_str:
                    pairs = []
                    for pair in data_str.split(","):
                        parts = pair.strip().split()
                        if len(parts) == 2:
                            pairs.append([float(parts[0]), float(parts[1])])
                    if pairs:
                        em_data = pairs
            except Exception as exc:
                print("  Could not fetch EM spectrum data: %s" % exc)

    if ex_data and em_data:
        return (ex_max, em_max, {"excitation": ex_data, "emission": em_data})

    return (ex_max, em_max, None)


def main():
    output_path = Path(__file__).parent / "fluorophores.json"
    results = []
    success_count = 0
    fallback_count = 0

    for fpbase_name, display_name, fallback_ex, fallback_em in FLUOROPHORES:
        print("Processing: %s (%s)" % (display_name, fpbase_name))

        fetched = fetch_from_fpbase(fpbase_name)

        if fetched and fetched[2] is not None:
            ex_max, em_max, spectra = fetched
            source = "fpbase"
            success_count += 1
            print("  ✓ Real spectra from FPbase")
        else:
            # Use FPbase ex/em max if available, otherwise fallback
            if fetched and fetched[0] is not None:
                ex_max = fetched[0]
                em_max = fetched[1] or fallback_em
            else:
                ex_max = fallback_ex
                em_max = fallback_em

            spectra = make_gaussian_fallback(ex_max, em_max)
            source = "gaussian_approximation"
            fallback_count += 1
            print("  ⚠ Using Gaussian approximation (ex=%d, em=%d)" % (ex_max, em_max))

        results.append({
            "id": str(uuid.uuid4()),
            "name": display_name,
            "excitation_max_nm": ex_max,
            "emission_max_nm": em_max,
            "spectra": spectra,
            "source": source,
        })

    with open(output_path, "w") as fh:
        json.dump(results, fh, indent=2)

    print("\n" + "=" * 50)
    print("Done! Wrote %d fluorophores to %s" % (len(results), output_path))
    print("  FPbase real spectra: %d" % success_count)
    print("  Gaussian fallback:   %d" % fallback_count)
    print("\nCopy this file to: backend/seed_data/fluorophores.json")


if __name__ == "__main__":
    main()
