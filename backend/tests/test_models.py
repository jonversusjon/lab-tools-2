from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from models import Antibody
from models import Detector
from models import DyeLabel
from models import Fluorophore
from models import Instrument
from models import Laser
from models import Panel
from models import PanelAssignment
from models import PanelTarget


def test_create_all_models(db_session):
    """Create one of each model and verify it persists."""
    instrument = Instrument(name="Test Instrument")
    db_session.add(instrument)
    db_session.flush()

    laser = Laser(instrument_id=instrument.id, wavelength_nm=488, name="Blue")
    db_session.add(laser)
    db_session.flush()

    detector = Detector(laser_id=laser.id, filter_midpoint=530, filter_width=30)
    db_session.add(detector)
    db_session.flush()

    fluorophore = Fluorophore(
        id="test-model-create",
        name="TestDye-ModelCreate",
        ex_max_nm=494,
        em_max_nm=519,
        source="user",
    )
    db_session.add(fluorophore)
    db_session.flush()

    antibody = Antibody(target="CD3", fluorophore_id=fluorophore.id)
    db_session.add(antibody)
    db_session.flush()

    panel = Panel(name="Test Panel", instrument_id=instrument.id)
    db_session.add(panel)
    db_session.flush()

    target = PanelTarget(panel_id=panel.id, antibody_id=antibody.id)
    db_session.add(target)
    db_session.flush()

    assignment = PanelAssignment(
        panel_id=panel.id,
        antibody_id=antibody.id,
        fluorophore_id=fluorophore.id,
        detector_id=detector.id,
    )
    db_session.add(assignment)
    db_session.flush()

    assert db_session.get(Instrument, instrument.id) is not None
    assert db_session.get(Laser, laser.id) is not None
    assert db_session.get(Detector, detector.id) is not None
    assert db_session.get(Fluorophore, fluorophore.id) is not None
    assert db_session.get(Antibody, antibody.id) is not None
    assert db_session.get(Panel, panel.id) is not None
    assert db_session.get(PanelTarget, target.id) is not None
    assert db_session.get(PanelAssignment, assignment.id) is not None


def test_all_pks_are_strings(db_session):
    """All model PKs must be str, not UUID objects."""
    instrument = Instrument(name="Test")
    db_session.add(instrument)
    db_session.flush()

    laser = Laser(instrument_id=instrument.id, wavelength_nm=405, name="Violet")
    db_session.add(laser)
    db_session.flush()

    detector = Detector(laser_id=laser.id, filter_midpoint=450, filter_width=40)
    db_session.add(detector)
    db_session.flush()

    fluorophore = Fluorophore(id="test-pk-check", name="TestDye-PKCheck", ex_max_nm=360, em_max_nm=460, source="user")
    db_session.add(fluorophore)
    db_session.flush()

    antibody = Antibody(target="CD4")
    db_session.add(antibody)
    db_session.flush()

    panel = Panel(name="P1")
    db_session.add(panel)
    db_session.flush()

    target = PanelTarget(panel_id=panel.id, antibody_id=antibody.id)
    db_session.add(target)
    db_session.flush()

    for obj in [instrument, laser, detector, fluorophore, antibody, panel, target]:
        assert isinstance(obj.id, str), (
            "%s.id is %s, expected str" % (type(obj).__name__, type(obj.id).__name__)
        )


def test_fk_pragma_active(db_session):
    """FK pragma must be active: inserting with a non-existent FK should fail."""
    assignment = PanelAssignment(
        panel_id="nonexistent-panel-id",
        antibody_id="nonexistent-antibody-id",
        fluorophore_id="nonexistent-fluorophore-id",
        detector_id="nonexistent-detector-id",
    )
    db_session.add(assignment)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_panel_target_nullable_antibody(db_session):
    """PanelTarget can have null antibody_id (empty placeholder row)."""
    panel = Panel(name="P1")
    db_session.add(panel)
    db_session.flush()

    target = PanelTarget(panel_id=panel.id, antibody_id=None, sort_order=0)
    db_session.add(target)
    db_session.flush()

    assert target.antibody_id is None
    assert target.staining_mode == "direct"


def test_panel_target_multiple_null_antibodies(db_session):
    """Multiple null-antibody targets are allowed in the same panel."""
    panel = Panel(name="P1")
    db_session.add(panel)
    db_session.flush()

    t1 = PanelTarget(panel_id=panel.id, antibody_id=None, sort_order=0)
    t2 = PanelTarget(panel_id=panel.id, antibody_id=None, sort_order=1)
    db_session.add(t1)
    db_session.add(t2)
    db_session.flush()

    assert t1.id != t2.id


def test_panel_null_instrument(db_session):
    """Panel can exist with instrument_id set to None."""
    panel = Panel(name="No Instrument Panel", instrument_id=None)
    db_session.add(panel)
    db_session.flush()

    loaded = db_session.get(Panel, panel.id)
    assert loaded is not None
    assert loaded.instrument_id is None


def test_dye_label_model_create(db_session):
    """Basic DyeLabel create + flush verifies PK is a string."""
    dl = DyeLabel(name="Hoechst 33342", label_target="Nuclei", category="nucleic acid")
    db_session.add(dl)
    db_session.flush()

    loaded = db_session.get(DyeLabel, dl.id)
    assert loaded is not None
    assert isinstance(loaded.id, str)
    assert loaded.name == "Hoechst 33342"
    assert loaded.label_target == "Nuclei"
    assert loaded.is_favorite is False


def test_dye_label_fluorophore_set_null(db_session):
    """Deleting a fluorophore sets DyeLabel.fluorophore_id to NULL (SET NULL cascade)."""
    fl = Fluorophore(id="test-set-null-fl", name="TestSetNullFl", source="user")
    db_session.add(fl)
    db_session.flush()

    dl = DyeLabel(name="SetNullDye", label_target="Test", fluorophore_id=fl.id)
    db_session.add(dl)
    db_session.flush()

    assert dl.fluorophore_id == "test-set-null-fl"

    db_session.delete(fl)
    db_session.flush()

    db_session.expire(dl)
    assert dl.fluorophore_id is None
