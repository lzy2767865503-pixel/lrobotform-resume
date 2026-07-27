import contextlib
import io
import sys
import unittest
from pathlib import Path
from unittest import mock


RUNNER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RUNNER_ROOT))

import resume_runner  # noqa: E402


def accepted_resume():
    return {
        "name": "Synthetic Candidate",
        "contactLine": "candidate at example dot invalid",
        "headline": "Data Analyst",
        "summary": [
            "Turns structured evidence into clear findings.",
            "Documents assumptions and quality checks.",
        ],
        "education": [],
        "experience": [],
        "projects": [
            {
                "name": "Synthetic Analytics Project",
                "organization": "Local Test Fixture",
                "bullets": [
                    "Mapped source fields to a deterministic schema.",
                    "Tested validation failures before delivery.",
                    "Documented reproducible acceptance criteria.",
                ],
            }
        ],
        "extracurricular": [],
        "skills": {
            "technical": ["Data analysis"],
            "tools": ["Python"],
            "languages": ["English"],
            "soft": [],
        },
        "references": [],
        "atsKeywords": ["analysis"],
        "qualityNotes": [],
    }


class ResumeRunnerBehaviorTests(unittest.TestCase):
    def test_quality_gate_accepts_evidenced_content(self):
        result = resume_runner.resume_quality_report(
            accepted_resume(),
            {"resumeText": "Synthetic source material with no unsupported numeric claims."},
        )

        self.assertTrue(result["passed"])
        self.assertGreaterEqual(result["score"], result["minimum"])
        self.assertEqual(result["bulletCount"], 3)
        self.assertEqual(result["unsupportedNumbers"], [])

    def test_quality_gate_rejects_placeholders_and_invented_numbers(self):
        resume = accepted_resume()
        resume["name"] = "YOUR NAME"
        resume["projects"][0]["bullets"] = []
        resume["summary"] = []
        resume["atsKeywords"] = []
        resume["headline"] = "Claimed improvement of 99 percent"

        result = resume_runner.resume_quality_report(
            resume,
            {"resumeText": "Synthetic source with no quantified outcome."},
        )

        self.assertFalse(result["passed"])
        self.assertIn("99", result["unsupportedNumbers"])
        self.assertTrue(any("placeholder" in issue.lower() for issue in result["issues"]))

    def test_both_pdf_variants_render_and_pass_structural_validation(self):
        resume = accepted_resume()
        ats_pdf = resume_runner.render_ats_pdf(resume, "en")
        visual_pdf = resume_runner.render_visual_pdf(resume, "en")

        ats = resume_runner.validate_pdf_output(ats_pdf, "ATS")
        visual = resume_runner.validate_pdf_output(visual_pdf, "Visual")

        self.assertTrue(ats["passed"])
        self.assertTrue(visual["passed"])
        self.assertGreaterEqual(ats["pageCount"], 1)
        self.assertGreaterEqual(visual["pageCount"], 1)
        self.assertNotEqual(ats_pdf, visual_pdf)

    def test_truncated_pdf_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "quality check failed"):
            resume_runner.validate_pdf_output(b"%PDF-1.4\n%%EOF", "ATS")

    def test_runner_refuses_to_start_without_secrets(self):
        stderr = io.StringIO()
        with (
            mock.patch.object(resume_runner, "RUNNER_SECRET", ""),
            mock.patch.object(resume_runner, "OPENAI_API_KEY", ""),
            contextlib.redirect_stderr(stderr),
        ):
            exit_code = resume_runner.main()

        self.assertEqual(exit_code, 2)
        self.assertIn("RUNNER_SECRET is required", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
