#!/usr/bin/env python3
"""
Download all fluorophore excitation/emission spectra from FPbase.

Uses the FPbase GraphQL API (https://www.fpbase.org/graphql/) to bulk-fetch
proteins and organic dyes with their spectral data at nm resolution.

Outputs:
    fpbase_spectra_long.parquet  - long-format table (fluorophore, type, wavelength_nm, intensity)
    fpbase_spectra_wide.csv      - wide-format matrix (one column per fluorophore+spectrum_type)
    fpbase_metadata.csv          - fluorophore metadata (ex_max, em_max, ext_coeff, qy, etc.)

Requirements:
    pip install requests pandas pyarrow

Usage:
    python download_fpbase_spectra.py [--output-dir ./fpbase_data]
"""

import argparse
import json
import logging
import time
from pathlib import Path

import pandas as pd
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

FPBASE_GRAPHQL = "https://www.fpbase.org/graphql/"
HEADERS = {"Content-Type": "application/json", "User-Agent": "fpbase-bulk-download"}

# ---------------------------------------------------------------------------
# GraphQL queries
# ---------------------------------------------------------------------------

# Fetch all proteins with default_state spectra + metadata in one shot
PROTEINS_QUERY = """
{
    proteins {
        id
        name
        slug
        agg
        switchType
        defaultState {
            id
            name
            exMax
            emMax
            extCoeff
            qy
            lifetime
            spectra {
                id
                subtype
                data
            }
        }
    }
}
"""

# Fetch all dyes with spectra + metadata in one shot
DYES_QUERY = """
{
    dyes {
        id
        name
        slug
        exMax
        emMax
        extCoeff
        qy
        spectra {
            id
            subtype
            data
        }
    }
}
"""


def graphql_post(
    query: str,
    variables: dict | None = None,
    max_retries: int = 3,
) -> dict:
    """POST a GraphQL query to FPbase with retries."""
    payload = json.dumps({"query": query, "variables": variables or {}}).encode()
    for attempt in range(max_retries):
        try:
            resp = requests.post(FPBASE_GRAPHQL, data=payload, headers=HEADERS, timeout=120)
            resp.raise_for_status()
            data = resp.json()
            if "errors" in data:
                raise RuntimeError(
                    "GraphQL errors: "
                    + json.dumps(data["errors"], indent=2)
                )
            return data["data"]
        except (requests.RequestException, RuntimeError) as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                log.warning("Attempt %d failed: %s. Retrying in %ds...", attempt + 1, e, wait)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("Unreachable")  # makes type-checker happy


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

SUBTYPE_LABELS = {
    "EX": "excitation",
    "EM": "emission",
    "AB": "absorption",
    "A_2P": "two_photon_absorption",
}


def parse_spectra_rows(
    name: str,
    fluor_type: str,
    spectra: list[dict],
) -> list[dict]:
    """Expand a fluorophore's spectra list into long-format rows."""
    rows = []
    for spec in spectra:
        subtype = spec["subtype"]
        label = SUBTYPE_LABELS.get(subtype, subtype)
        for wl, intensity in spec["data"]:
            rows.append({
                "fluorophore": name,
                "fluor_type": fluor_type,
                "spectrum_type": label,
                "spectrum_subtype": subtype,
                "wavelength_nm": wl,
                "intensity": intensity,
            })
    return rows


def parse_proteins(proteins: list[dict]) -> tuple[list[dict], list[dict]]:
    """Return (spectra_rows, metadata_rows) for all proteins."""
    spectra_rows = []
    meta_rows = []
    for p in proteins:
        name = p["name"]
        state = p.get("defaultState")
        if state is None:
            log.debug("Skipping protein %s (no default state)", name)
            continue
        spectra = state.get("spectra") or []
        spectra_rows.extend(parse_spectra_rows(name, "protein", spectra))
        meta_rows.append({
            "fluorophore": name,
            "fluor_type": "protein",
            "fpbase_id": p["id"],
            "slug": p.get("slug", ""),
            "ex_max_nm": state.get("exMax"),
            "em_max_nm": state.get("emMax"),
            "ext_coeff": state.get("extCoeff"),
            "qy": state.get("qy"),
            "lifetime_ns": state.get("lifetime"),
            "oligomerization": p.get("agg"),
            "switch_type": p.get("switchType"),
            "n_spectra": len(spectra),
        })
    return spectra_rows, meta_rows


def parse_dyes(dyes: list[dict]) -> tuple[list[dict], list[dict]]:
    """Return (spectra_rows, metadata_rows) for all dyes."""
    spectra_rows = []
    meta_rows = []
    for d in dyes:
        name = d["name"]
        spectra = d.get("spectra") or []
        spectra_rows.extend(parse_spectra_rows(name, "dye", spectra))
        meta_rows.append({
            "fluorophore": name,
            "fluor_type": "dye",
            "fpbase_id": d["id"],
            "slug": d.get("slug", ""),
            "ex_max_nm": d.get("exMax"),
            "em_max_nm": d.get("emMax"),
            "ext_coeff": d.get("extCoeff"),
            "qy": d.get("qy"),
            "lifetime_ns": None,
            "oligomerization": None,
            "switch_type": None,
            "n_spectra": len(spectra),
        })
    return spectra_rows, meta_rows


# ---------------------------------------------------------------------------
# Wide-format pivot
# ---------------------------------------------------------------------------

def make_wide(df_long: pd.DataFrame) -> pd.DataFrame:
    """Pivot long spectra to wide: rows = wavelength_nm, columns = fluorophore|type."""
    df_long = df_long.copy()
    df_long["col_name"] = (
        df_long["fluorophore"] + "|" + df_long["spectrum_type"]
    )
    wide = df_long.pivot_table(
        index="wavelength_nm",
        columns="col_name",
        values="intensity",
        aggfunc="first",
    )
    wide = wide.sort_index()
    wide.columns.name = None
    return wide


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(output_dir: str = "./fpbase_data") -> None:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # --- Fetch proteins ---
    log.info("Fetching all proteins from FPbase...")
    protein_data = graphql_post(PROTEINS_QUERY)
    proteins = protein_data["proteins"]
    log.info("  Retrieved %d proteins", len(proteins))

    # --- Fetch dyes ---
    log.info("Fetching all dyes from FPbase...")
    dye_data = graphql_post(DYES_QUERY)
    dyes = dye_data["dyes"]
    log.info("  Retrieved %d dyes", len(dyes))

    # --- Parse ---
    log.info("Parsing spectra...")
    p_spec, p_meta = parse_proteins(proteins)
    d_spec, d_meta = parse_dyes(dyes)

    df_long = pd.DataFrame(p_spec + d_spec)
    df_meta = pd.DataFrame(p_meta + d_meta)

    n_fluors = df_meta.shape[0]
    n_with_spectra = (df_meta["n_spectra"] > 0).sum()
    n_datapoints = df_long.shape[0]
    log.info(
        "  %d fluorophores total, %d with spectra, %d datapoints",
        n_fluors,
        n_with_spectra,
        n_datapoints,
    )

    # --- Save long-format parquet ---
    parquet_path = out / "fpbase_spectra_long.parquet"
    df_long.to_parquet(parquet_path, index=False)
    log.info("Saved long-format spectra → %s", parquet_path)

    # --- Save wide-format CSV ---
    if not df_long.empty:
        df_wide = make_wide(df_long)
        wide_csv = out / "fpbase_spectra_wide.csv"
        df_wide.to_csv(wide_csv)
        log.info("Saved wide-format spectra → %s (%d cols)", wide_csv, df_wide.shape[1])

    # --- Save metadata ---
    meta_csv = out / "fpbase_metadata.csv"
    df_meta.to_csv(meta_csv, index=False)
    log.info("Saved metadata → %s", meta_csv)

    # --- Summary ---
    print("\n" + "=" * 60)
    print("FPbase download complete")
    print("=" * 60)
    print(f"  Proteins:      {len(proteins)}")
    print(f"  Dyes:          {len(dyes)}")
    print(f"  With spectra:  {n_with_spectra}")
    print(f"  Datapoints:    {n_datapoints}")
    print(f"  Output dir:    {out.resolve()}")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk download FPbase spectra")
    parser.add_argument(
        "--output-dir",
        default="./fpbase_data",
        help="Directory for output files (default: ./fpbase_data)",
    )
    args = parser.parse_args()
    main(output_dir=args.output_dir)