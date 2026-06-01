from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload

from models import DyeLabel
from models import IFPanel
from models import IFPanelAssignment
from models import IFPanelTarget
from models import Instrument
from models import Laser
from models import Microscope
from models import MicroscopeLaser
from models import Panel
from models import PanelAssignment
from models import PanelTarget
from models import SecondaryAntibody


def _snapshot_instrument(instrument):
    if instrument is None:
        return None
    return {
        "id": instrument.id,
        "name": instrument.name,
        "lasers": [
            {
                "id": laser.id,
                "wavelength_nm": laser.wavelength_nm,
                "name": laser.name,
                "detectors": [
                    {
                        "id": det.id,
                        "filter_midpoint": det.filter_midpoint,
                        "filter_width": det.filter_width,
                        "name": det.name,
                    }
                    for det in laser.detectors
                ],
            }
            for laser in sorted(instrument.lasers, key=lambda l: l.wavelength_nm)
        ],
    }


def _snapshot_microscope(microscope):
    if microscope is None:
        return None
    return {
        "id": microscope.id,
        "name": microscope.name,
        "lasers": [
            {
                "id": laser.id,
                "wavelength_nm": laser.wavelength_nm,
                "name": laser.name,
                "excitation_type": laser.excitation_type,
                "ex_filter_width": laser.ex_filter_width,
                "filters": [
                    {
                        "id": filt.id,
                        "filter_midpoint": filt.filter_midpoint,
                        "filter_width": filt.filter_width,
                        "name": filt.name,
                    }
                    for filt in laser.filters
                ],
            }
            for laser in sorted(microscope.lasers, key=lambda l: l.wavelength_nm)
        ],
    }


def build_flow_panel_snapshot(panel_id: str, db: Session) -> dict:
    """Serialize a flow Panel template into a Tiptap flow_panel node.

    Returns ``{"type": "flow_panel", "attrs": {...}}``. Read-only — performs no
    DB writes. Shared by the snapshot-panel persistence route and the
    snapshot-preview read route so both emit identical content.
    """
    stmt = (
        select(Panel)
        .options(
            selectinload(Panel.targets).selectinload(PanelTarget.antibody),
            selectinload(Panel.targets)
            .selectinload(PanelTarget.secondary_antibody)
            .selectinload(SecondaryAntibody.fluorophore),
            selectinload(Panel.targets)
            .selectinload(PanelTarget.dye_label)
            .selectinload(DyeLabel.fluorophore),
            selectinload(Panel.assignments).selectinload(PanelAssignment.fluorophore),
            selectinload(Panel.assignments).selectinload(PanelAssignment.detector),
            selectinload(Panel.instrument)
            .selectinload(Instrument.lasers)
            .selectinload(Laser.detectors),
        )
        .where(Panel.id == panel_id)
    )
    panel = db.scalars(stmt).first()
    if panel is None:
        raise HTTPException(status_code=404, detail="Panel not found")

    attrs = {
        "source_panel_id": panel.id,
        "name": panel.name,
        "instrument": _snapshot_instrument(panel.instrument),
        "targets": [
            {
                "id": str(uuid.uuid4()),
                "antibody_id": t.antibody_id,
                "antibody_name": t.antibody.name if t.antibody else None,
                "antibody_target": t.antibody.target if t.antibody else None,
                "antibody_host": t.antibody.host if t.antibody else None,
                "antibody_clone": t.antibody.clone if t.antibody else None,
                "dye_label_id": t.dye_label_id,
                "dye_label_name": t.dye_label.name if t.dye_label else None,
                "dye_label_target": t.dye_label.label_target if t.dye_label else None,
                "dye_label_fluorophore_id": (
                    t.dye_label.fluorophore_id if t.dye_label else None
                ),
                "dye_label_fluorophore_name": (
                    t.dye_label.fluorophore.name
                    if t.dye_label and t.dye_label.fluorophore else None
                ),
                "staining_mode": t.staining_mode,
                "secondary_antibody_id": t.secondary_antibody_id,
                "secondary_antibody_name": (
                    t.secondary_antibody.name if t.secondary_antibody else None
                ),
                "sort_order": t.sort_order,
                "flow_dilution_factor": (
                    t.antibody.flow_dilution_factor if t.antibody else None
                ),
                "icc_if_dilution_factor": (
                    t.antibody.icc_if_dilution_factor if t.antibody else None
                ),
            }
            for t in sorted(panel.targets, key=lambda x: x.sort_order)
        ],
        "assignments": [
            {
                "id": str(uuid.uuid4()),
                "antibody_id": a.antibody_id,
                "dye_label_id": a.dye_label_id,
                "fluorophore_id": a.fluorophore_id,
                "fluorophore_name": a.fluorophore.name if a.fluorophore else None,
                "detector_id": a.detector_id,
                "detector_name": a.detector.name if a.detector else None,
            }
            for a in panel.assignments
        ],
        "volume_params": {
            "num_samples": 1,
            "volume_per_sample_ul": 100,
            "pipet_error_factor": 1.1,
            "dilution_source": "flow",
        },
    }
    return {"type": "flow_panel", "attrs": attrs}


def build_if_panel_snapshot(panel_id: str, db: Session) -> dict:
    """Serialize an IF Panel template into a Tiptap if_panel node.

    Returns ``{"type": "if_panel", "attrs": {...}}``. Read-only — performs no
    DB writes. Shared by the snapshot-panel persistence route and the
    snapshot-preview read route so both emit identical content.
    """
    stmt = (
        select(IFPanel)
        .options(
            selectinload(IFPanel.targets).selectinload(IFPanelTarget.antibody),
            selectinload(IFPanel.targets)
            .selectinload(IFPanelTarget.secondary_antibody)
            .selectinload(SecondaryAntibody.fluorophore),
            selectinload(IFPanel.targets)
            .selectinload(IFPanelTarget.dye_label)
            .selectinload(DyeLabel.fluorophore),
            selectinload(IFPanel.assignments).selectinload(IFPanelAssignment.fluorophore),
            selectinload(IFPanel.assignments).selectinload(IFPanelAssignment.filter),
            selectinload(IFPanel.microscope)
            .selectinload(Microscope.lasers)
            .selectinload(MicroscopeLaser.filters),
        )
        .where(IFPanel.id == panel_id)
    )
    if_panel = db.scalars(stmt).first()
    if if_panel is None:
        raise HTTPException(status_code=404, detail="IF panel not found")

    attrs = {
        "source_panel_id": if_panel.id,
        "name": if_panel.name,
        "panel_type": if_panel.panel_type,
        "microscope": _snapshot_microscope(if_panel.microscope),
        "view_mode": if_panel.view_mode,
        "targets": [
            {
                "id": str(uuid.uuid4()),
                "antibody_id": t.antibody_id,
                "antibody_name": t.antibody.name if t.antibody else None,
                "antibody_target": t.antibody.target if t.antibody else None,
                "antibody_host": t.antibody.host if t.antibody else None,
                "dye_label_id": t.dye_label_id,
                "dye_label_name": t.dye_label.name if t.dye_label else None,
                "dye_label_target": t.dye_label.label_target if t.dye_label else None,
                "dye_label_fluorophore_id": (
                    t.dye_label.fluorophore_id if t.dye_label else None
                ),
                "dye_label_fluorophore_name": (
                    t.dye_label.fluorophore.name
                    if t.dye_label and t.dye_label.fluorophore else None
                ),
                "staining_mode": t.staining_mode,
                "secondary_antibody_id": t.secondary_antibody_id,
                "secondary_antibody_name": (
                    t.secondary_antibody.name if t.secondary_antibody else None
                ),
                "secondary_fluorophore_id": (
                    t.secondary_antibody.fluorophore_id
                    if t.secondary_antibody else None
                ),
                "secondary_fluorophore_name": (
                    t.secondary_antibody.fluorophore.name
                    if t.secondary_antibody and t.secondary_antibody.fluorophore else None
                ),
                "sort_order": t.sort_order,
                "dilution_override": t.dilution_override,
                "icc_if_dilution_factor": (
                    t.antibody.icc_if_dilution_factor if t.antibody else None
                ),
            }
            for t in sorted(if_panel.targets, key=lambda x: x.sort_order)
        ],
        "assignments": [
            {
                "id": str(uuid.uuid4()),
                "antibody_id": a.antibody_id,
                "dye_label_id": a.dye_label_id,
                "fluorophore_id": a.fluorophore_id,
                "fluorophore_name": a.fluorophore.name if a.fluorophore else None,
                "filter_id": a.filter_id,
                "filter_name": a.filter.name if a.filter else None,
            }
            for a in if_panel.assignments
        ],
        "volume_params": {
            "num_samples": 1,
            "volume_per_sample_ul": 200,
            "pipet_error_factor": 1.1,
            "dilution_source": "icc_if",
        },
    }
    return {"type": "if_panel", "attrs": attrs}
