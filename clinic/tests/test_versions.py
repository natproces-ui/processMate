"""Versions de procédure (manager/version_store.py), base simulée."""
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manager import version_store as vs  # noqa: E402


def fake_db(existing_rows):
    db = mock.MagicMock()
    db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = existing_rows
    return db


class VersionsTest(unittest.TestCase):
    before = {"workflow_json": [{"id": "1"}], "enrichments_json": {"__bpmn_xml__": "<x/>"}, "procedure_metadata_json": {}}
    after = {"workflow_json": [{"id": "1"}, {"id": "2"}], "enrichments_json": {}, "procedure_metadata_json": {}}

    def test_disabled_does_nothing(self):
        with mock.patch.dict(os.environ, {"VERSIONS_ENABLED": "false"}), mock.patch.object(vs, "_db") as db:
            vs.record_save("p", self.before, self.after)
        db.assert_not_called()

    def test_first_save_keeps_initial_state(self):
        with mock.patch.dict(os.environ, {"VERSIONS_ENABLED": "true"}), \
                mock.patch.object(vs, "_db", return_value=fake_db([])), mock.patch.object(vs, "add") as add:
            vs.record_save("p", self.before, self.after, "manuel", "u1")
        self.assertEqual([c.args[4] for c in add.call_args_list], ["initial", "manuel"])

    def test_later_save_only_one_version(self):
        with mock.patch.dict(os.environ, {"VERSIONS_ENABLED": "true"}), \
                mock.patch.object(vs, "_db", return_value=fake_db([{"id": "v1"}])), mock.patch.object(vs, "add") as add:
            vs.record_save("p", self.before, self.after)
        self.assertEqual(add.call_count, 1)

    def test_errors_never_raise(self):
        with mock.patch.dict(os.environ, {"VERSIONS_ENABLED": "true"}), \
                mock.patch.object(vs, "_db", side_effect=RuntimeError("table absente")):
            vs.record_save("p", self.before, self.after)  # ne lève pas

    def test_xml_split(self):
        enr, xml = vs.split_enrichments({"a": 1, "__bpmn_xml__": "<x/>"})
        self.assertEqual((enr, xml), ({"a": 1}, "<x/>"))


if __name__ == "__main__":
    unittest.main()
