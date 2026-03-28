from __future__ import annotations

import pytest

from services.csv_import import parse_csv_file
from services.csv_import import parse_csv_row
from services.csv_import import parse_host_species


class TestParseHostSpecies:
    def test_simple_host(self):
        result = parse_host_species("Rabbit")
        assert result["host_species"] == "Rabbit"
        assert result["conjugate"] is None
        assert result["isotype"] is None

    def test_host_with_isotype(self):
        result = parse_host_species("IgG1, Mouse")
        assert result["host_species"] == "Mouse"
        assert result["isotype"] == "IgG1"
        assert result["conjugate"] is None

    def test_conjugated_with_isotype_and_host(self):
        result = parse_host_species("FITC Conjugated, IgG1, Mouse")
        assert result["conjugate"] == "FITC"
        assert result["isotype"] == "IgG1"
        assert result["host_species"] == "Mouse"

    def test_bv785_conjugated(self):
        result = parse_host_species("BV785 Conjugated, IgG1, Mouse")
        assert result["conjugate"] == "BV785"
        assert result["isotype"] == "IgG1"
        assert result["host_species"] == "Mouse"

    def test_af647_conjugated_only(self):
        result = parse_host_species("AF647 Conjugated")
        assert result["conjugate"] == "AF647"
        assert result["host_species"] is None
        assert result["isotype"] is None

    def test_empty_string(self):
        result = parse_host_species("")
        assert result["host_species"] is None

    def test_none_value(self):
        result = parse_host_species(None)
        assert result["host_species"] is None

    def test_none_string(self):
        result = parse_host_species("None")
        assert result["host_species"] is None

    def test_armenian_hamster(self):
        result = parse_host_species("Armenian Hamster")
        assert result["host_species"] == "Armenian Hamster"

    def test_chicken(self):
        result = parse_host_species("Chicken")
        assert result["host_species"] == "Chicken"

    def test_igg2a(self):
        result = parse_host_species("IgG2a, Rat")
        assert result["isotype"] == "IgG2a"
        assert result["host_species"] == "Rat"

    def test_human_igg1(self):
        result = parse_host_species("Human IgG1, Mouse")
        assert result["isotype"] == "Human IgG1"
        assert result["host_species"] == "Mouse"


class TestParseCsvRow:
    def test_basic_row(self):
        row = {
            "Antibody": "TUJ1 chk Millipore",
            "Catalog No.": "AB9354",
            "Cojugate": "",
            "Confirmed we have it": "Yes",
            "Host Species": "Chicken",
            "Manufacturer": "Millipore",
            "Flow Dilution": "1:500",
            "Storage Temperature": "4C",
        }
        result = parse_csv_row(row, 0)
        assert result["error"] is None
        p = result["parsed"]
        assert p["name"] == "TUJ1 chk Millipore"
        assert p["catalog_number"] == "AB9354"
        assert p["host_species"] == "Chicken"
        assert p["manufacturer"] == "Millipore"
        assert p["confirmed_in_stock"] is True
        assert p["flow_dilution"] == "1:500"
        assert p["storage_temp"] == "4C"

    def test_missing_antibody_name(self):
        row = {"Antibody": "", "Catalog No.": "AB123"}
        result = parse_csv_row(row, 0)
        assert result["error"] is not None
        assert "Missing required" in result["error"]

    def test_conjugate_precedence(self):
        """Explicit Cojugate field takes precedence over Host Species parsing."""
        row = {
            "Antibody": "Test Ab",
            "Cojugate": "PE",
            "Host Species": "FITC Conjugated, IgG1, Mouse",
        }
        result = parse_csv_row(row, 0)
        assert result["parsed"]["conjugate"] == "PE"

    def test_conjugate_from_host_species(self):
        """When Cojugate is empty, extract from Host Species."""
        row = {
            "Antibody": "Test Ab",
            "Cojugate": "",
            "Host Species": "AF647 Conjugated, IgG1, Mouse",
        }
        result = parse_csv_row(row, 0)
        assert result["parsed"]["conjugate"] == "AF647"

    def test_reacts_with_parsing(self):
        row = {
            "Antibody": "Test Ab",
            "Reacts with": "Human, Mouse, Rat",
        }
        result = parse_csv_row(row, 0)
        assert result["parsed"]["reacts_with"] == ["Human", "Mouse", "Rat"]

    def test_missing_fields_flagged(self):
        row = {"Antibody": "Test Ab"}
        result = parse_csv_row(row, 0)
        missing = result["missing_fields"]
        assert "host_species" in missing
        assert "manufacturer" in missing
        assert "catalog_number" in missing

    def test_date_parsing(self):
        row = {
            "Antibody": "Test Ab",
            "Date Received": "March 3, 2022",
        }
        result = parse_csv_row(row, 0)
        assert result["parsed"]["date_received"] == "2022-03-03"


class TestParseCsvFile:
    def test_basic_csv(self):
        csv_content = (
            "Antibody,Catalog No.,Manufacturer,Host Species\n"
            "TUJ1 chk,AB9354,Millipore,Chicken\n"
            "cFos rb,AB190289,abcam,Rabbit\n"
        ).encode("utf-8-sig")

        results = parse_csv_file(csv_content)
        assert len(results) == 2
        assert results[0]["parsed"]["name"] == "TUJ1 chk"
        assert results[1]["parsed"]["name"] == "cFos rb"
        assert results[0]["csv_row_index"] == 0
        assert results[1]["csv_row_index"] == 1


class TestImportEndpoints:
    def test_import_csv_upload(self, client):
        csv_content = (
            "Antibody,Catalog No.,Manufacturer,Host Species,Confirmed we have it\n"
            "NewAntibody1,CAT001,BioLegend,Mouse,Yes\n"
            "NewAntibody2,CAT002,abcam,Rabbit,No\n"
        )
        resp = client.post(
            "/api/v1/antibodies/import-csv",
            files={"file": ("test.csv", csv_content.encode("utf-8"), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["summary"]["total_csv_rows"] == 2
        assert data["summary"]["new"] == 2
        assert data["summary"]["existing"] == 0
        assert len(data["new_antibodies"]) == 2

    def test_import_csv_detects_existing(self, client):
        # First create an antibody
        client.post(
            "/api/v1/antibodies",
            json={"target": "CD3", "name": "ExistingAb", "catalog_number": "CAT999"},
        )

        csv_content = (
            "Antibody,Catalog No.\n"
            "ExistingAb,CAT999\n"
            "BrandNew,CAT001\n"
        )
        resp = client.post(
            "/api/v1/antibodies/import-csv",
            files={"file": ("test.csv", csv_content.encode("utf-8"), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["summary"]["existing"] == 1
        assert data["summary"]["new"] == 1

    def test_import_confirm(self, client):
        resp = client.post(
            "/api/v1/antibodies/import-confirm",
            json={
                "antibodies": [
                    {
                        "name": "ImportedAb1",
                        "target": "CD45",
                        "catalog_number": "IMP001",
                        "host": "Mouse",
                        "vendor": "BioLegend",
                    },
                    {
                        "name": "ImportedAb2",
                        "catalog_number": "IMP002",
                        "host": "Rabbit",
                    },
                ]
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["imported"] == 2
        assert len(data["errors"]) == 0

        # Verify they exist
        resp = client.get("/api/v1/antibodies")
        items = resp.json()["items"]
        names = [ab["name"] for ab in items]
        assert "ImportedAb1" in names
        assert "ImportedAb2" in names


class TestFavorites:
    def test_toggle_antibody_favorite(self, client):
        # Get first antibody
        resp = client.get("/api/v1/antibodies")
        ab = resp.json()["items"][0]
        assert ab["is_favorite"] is False

        # Toggle on
        resp = client.patch(
            "/api/v1/antibodies/%s/favorite" % ab["id"],
            json={"is_favorite": True},
        )
        assert resp.status_code == 200
        assert resp.json()["is_favorite"] is True

        # Toggle off
        resp = client.patch(
            "/api/v1/antibodies/%s/favorite" % ab["id"],
            json={"is_favorite": False},
        )
        assert resp.status_code == 200
        assert resp.json()["is_favorite"] is False

    def test_filter_favorites(self, client):
        # Get first antibody and favorite it
        resp = client.get("/api/v1/antibodies")
        ab = resp.json()["items"][0]
        client.patch(
            "/api/v1/antibodies/%s/favorite" % ab["id"],
            json={"is_favorite": True},
        )

        # Filter favorites
        resp = client.get("/api/v1/antibodies?favorites=true")
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["id"] == ab["id"]

    def test_toggle_fluorophore_favorite(self, client):
        resp = client.get("/api/v1/fluorophores")
        fl = resp.json()["items"][0]

        resp = client.patch(
            "/api/v1/fluorophores/%s/favorite" % fl["id"],
            json={"is_favorite": True},
        )
        assert resp.status_code == 200
        assert resp.json()["is_favorite"] is True


class TestTags:
    def test_create_tag(self, client):
        resp = client.post(
            "/api/v1/tags",
            json={"name": "my-tag", "color": "#ff0000"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "my-tag"
        assert data["color"] == "#ff0000"

    def test_list_tags(self, client):
        client.post("/api/v1/tags", json={"name": "tag-a"})
        client.post("/api/v1/tags", json={"name": "tag-b"})
        resp = client.get("/api/v1/tags")
        assert resp.status_code == 200
        tags = resp.json()
        names = [t["name"] for t in tags]
        assert "tag-a" in names
        assert "tag-b" in names

    def test_delete_tag(self, client):
        resp = client.post("/api/v1/tags", json={"name": "to-delete"})
        tag_id = resp.json()["id"]
        resp = client.delete("/api/v1/tags/%s" % tag_id)
        assert resp.status_code == 204

    def test_assign_tags_to_antibody(self, client):
        # Create tags
        resp1 = client.post("/api/v1/tags", json={"name": "tag-x"})
        resp2 = client.post("/api/v1/tags", json={"name": "tag-y"})
        tag_x_id = resp1.json()["id"]
        tag_y_id = resp2.json()["id"]

        # Get antibody
        resp = client.get("/api/v1/antibodies")
        ab = resp.json()["items"][0]

        # Assign tags
        resp = client.post(
            "/api/v1/antibodies/%s/tags" % ab["id"],
            json={"tag_ids": [tag_x_id, tag_y_id]},
        )
        assert resp.status_code == 200
        tag_names = [t["name"] for t in resp.json()["tags"]]
        assert "tag-x" in tag_names
        assert "tag-y" in tag_names

    def test_remove_tag_from_antibody(self, client):
        resp = client.post("/api/v1/tags", json={"name": "remove-me"})
        tag_id = resp.json()["id"]

        resp = client.get("/api/v1/antibodies")
        ab = resp.json()["items"][0]

        client.post(
            "/api/v1/antibodies/%s/tags" % ab["id"],
            json={"tag_ids": [tag_id]},
        )

        resp = client.delete(
            "/api/v1/antibodies/%s/tags/%s" % (ab["id"], tag_id),
        )
        assert resp.status_code == 204

    def test_filter_by_tags(self, client):
        resp = client.post("/api/v1/tags", json={"name": "filter-tag"})
        tag_id = resp.json()["id"]

        resp = client.get("/api/v1/antibodies")
        ab = resp.json()["items"][0]

        client.post(
            "/api/v1/antibodies/%s/tags" % ab["id"],
            json={"tag_ids": [tag_id]},
        )

        resp = client.get("/api/v1/antibodies?tags=%s" % tag_id)
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["id"] == ab["id"]

    def test_duplicate_tag_name_returns_409(self, client):
        client.post("/api/v1/tags", json={"name": "unique-tag"})
        resp = client.post("/api/v1/tags", json={"name": "unique-tag"})
        assert resp.status_code == 409
