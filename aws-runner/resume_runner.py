#!/usr/bin/env python3
# Copyright (c) 2026 LAI ZEYU. All rights reserved.

import base64
import io
import json
import os
import re
import sys
import time
import traceback
import urllib.error
import urllib.request


BASE_URL = os.environ.get("LROBOTFORM_BASE_URL", "https://lrobotform.com").rstrip("/")
RUNNER_SECRET = os.environ.get("RUNNER_SECRET", "").strip()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_TEXT_MODEL = os.environ.get("OPENAI_TEXT_MODEL") or os.environ.get("OPENAI_MODEL") or "gpt-4.1-mini"
POLL_SECONDS = max(2, int(os.environ.get("POLL_SECONDS", "8")))
RESUME_MAX_ATTEMPTS = max(2, int(os.environ.get("RESUME_MAX_ATTEMPTS", "3")))
RESUME_QUALITY_MIN = max(70, min(95, int(os.environ.get("RESUME_QUALITY_MIN", "82"))))


def log(message):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}", flush=True)


def api_post(path, payload=None, timeout=60):
    if not RUNNER_SECRET:
        raise RuntimeError("RUNNER_SECRET is missing.")
    data = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {RUNNER_SECRET}",
            "Content-Type": "application/json",
            "User-Agent": "Lrobotform-Resume-Runner/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode(resp.headers.get_content_charset() or "utf-8", "replace")
            parsed = json.loads(body or "{}")
            if not parsed.get("ok"):
                raise RuntimeError(parsed.get("error") or f"API error {resp.status}")
            return parsed
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")[:800]
        raise RuntimeError(f"Cloud API HTTP {exc.code}: {body}") from exc


def update_resume_job(job_id, lease_token, status, result=None, error="", ats_pdf=None, visual_pdf=None):
    payload = {
        "jobId": job_id,
        "leaseToken": lease_token,
        "status": status,
        "result": result or {},
        "error": str(error or "")[:1000],
    }
    if ats_pdf:
        payload["atsPdfBase64"] = base64.b64encode(ats_pdf).decode("ascii")
    if visual_pdf:
        payload["visualPdfBase64"] = base64.b64encode(visual_pdf).decode("ascii")
    return api_post("/api/resume-runner/update", payload, timeout=90)


def json_from_text(value):
    text = str(value or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
    raise RuntimeError("OpenAI response was not valid JSON.")


def openai_json_completion(system, user, max_tokens=5000, temperature=0.15):
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is missing.")
    payload = json.dumps(user, ensure_ascii=False) if isinstance(user, (dict, list)) else str(user)
    last_error = None
    for attempt in range(1, RESUME_MAX_ATTEMPTS + 1):
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(
                {
                    "model": OPENAI_TEXT_MODEL,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": payload},
                    ],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "response_format": {"type": "json_object"},
                },
                ensure_ascii=False,
            ).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8", "replace"))
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return json_from_text(content)
        except Exception as exc:
            last_error = exc
            if attempt < RESUME_MAX_ATTEMPTS:
                time.sleep(min(2 * attempt, 5))
    raise RuntimeError(f"OpenAI resume request failed after {RESUME_MAX_ATTEMPTS} attempts: {last_error}")


def resume_schema():
    return {
        "name": "string",
        "contactLine": "string",
        "headline": "string",
        "summary": ["bullet string"],
        "education": [{"school": "string", "degree": "string", "dates": "string", "details": ["bullet string"]}],
        "experience": [{"title": "string", "organization": "string", "dates": "string", "bullets": ["bullet string"]}],
        "projects": [{"name": "string", "role": "string", "dates": "string", "bullets": ["bullet string"]}],
        "extracurricular": [{"name": "string", "role": "string", "dates": "string", "bullets": ["bullet string"]}],
        "skills": {"technical": ["string"], "tools": ["string"], "languages": ["string"], "soft": ["string"]},
        "references": ["string"],
        "atsKeywords": ["string"],
        "qualityNotes": ["string"],
    }


def call_openai_resume(job):
    system = (
        "You are a senior ATS resume writer and factual editor. Return strict JSON only. "
        "Use only facts present in the supplied source. Never invent schools, companies, dates, awards, certifications, GPA, metrics, tools, or responsibilities. "
        "When a metric is not supplied, improve impact through scope and action without adding a number. "
        "Prioritize the target role, concise action-led bullets, readable dates, ATS-safe section names, and natural role keywords. "
        "Preserve useful contact details and proper nouns exactly. Remove repetition and generic claims. "
        "If outputLanguage is zh, write Simplified Chinese. If outputLanguage is en, write professional international English."
    )
    user = {
        "targetRole": job.get("targetRole", ""),
        "targetCountry": job.get("targetCountry", ""),
        "outputLanguage": job.get("outputLanguage", "en"),
        "notes": job.get("notes", ""),
        "rawResumeText": job.get("resumeText", ""),
        "requiredOutputs": ["ats_single_column_pdf", "picture_style_pdf"],
        "jsonSchema": resume_schema(),
    }
    return normalize_resume(openai_json_completion(system, user, max_tokens=5200, temperature=0.2))


def audit_openai_resume(job, resume, issues=None):
    system = (
        "You are the final factuality and ATS quality gate for a resume. Return strict JSON only using the supplied schema. "
        "Compare every claim in the draft with the raw source. Delete or soften anything unsupported. Do not invent metrics. "
        "Repair missing useful source details, weak bullets, repetition, inconsistent dates, unclear section placement, and unnatural keyword stuffing. "
        "Keep the resume concise and practical for the target role. Preserve names, organizations, dates, qualifications, and contact data exactly when present."
    )
    payload = {
        "targetRole": job.get("targetRole", ""),
        "targetCountry": job.get("targetCountry", ""),
        "outputLanguage": job.get("outputLanguage", "en"),
        "notes": job.get("notes", ""),
        "rawResumeText": job.get("resumeText", ""),
        "draft": resume,
        "deterministicIssues": issues or [],
        "jsonSchema": resume_schema(),
    }
    return normalize_resume(openai_json_completion(system, payload, max_tokens=5200, temperature=0.05))


def as_list(value):
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value:
        return [str(value).strip()]
    return []


def normalize_entries(value):
    entries = value if isinstance(value, list) else []
    clean = []
    for item in entries:
        if not isinstance(item, dict):
            continue
        clean.append({key: item.get(key, "") for key in item.keys()})
    return clean


def normalize_resume(data):
    skills = data.get("skills") if isinstance(data.get("skills"), dict) else {}
    return {
        "name": str(data.get("name") or "YOUR NAME").strip()[:80],
        "contactLine": str(data.get("contactLine") or "").strip()[:180],
        "headline": str(data.get("headline") or "").strip()[:160],
        "summary": as_list(data.get("summary"))[:5],
        "education": normalize_entries(data.get("education"))[:4],
        "experience": normalize_entries(data.get("experience"))[:6],
        "projects": normalize_entries(data.get("projects"))[:6],
        "extracurricular": normalize_entries(data.get("extracurricular"))[:4],
        "skills": {
            "technical": as_list(skills.get("technical"))[:20],
            "tools": as_list(skills.get("tools"))[:20],
            "languages": as_list(skills.get("languages"))[:10],
            "soft": as_list(skills.get("soft"))[:12],
        },
        "references": as_list(data.get("references"))[:3],
        "atsKeywords": as_list(data.get("atsKeywords"))[:25],
        "qualityNotes": as_list(data.get("qualityNotes"))[:8],
    }


def resume_quality_report(resume, job):
    issues = []
    score = 100
    name = str(resume.get("name") or "").strip()
    if not name or name.upper() in {"YOUR NAME", "NAME", "N/A"}:
        issues.append("Candidate name is missing or still a placeholder.")
        score -= 20
    if not str(resume.get("headline") or "").strip():
        issues.append("Targeted headline is missing.")
        score -= 8
    if len(resume.get("summary") or []) < 2:
        issues.append("Professional summary needs at least two concise points.")
        score -= 8
    core_sections = [resume.get("education") or [], resume.get("experience") or [], resume.get("projects") or []]
    if not any(core_sections):
        issues.append("No education, experience, or project section was extracted.")
        score -= 30
    bullet_count = 0
    empty_entries = 0
    for section in ["education", "experience", "projects", "extracurricular"]:
        for entry in resume.get(section) or []:
            bullets = as_list(entry.get("bullets") or entry.get("details"))
            bullet_count += len(bullets)
            if not any(str(entry.get(key) or "").strip() for key in ["school", "degree", "title", "organization", "name", "role"]):
                empty_entries += 1
    if bullet_count < 3:
        issues.append("Resume has too few evidence-based bullets.")
        score -= 12
    if empty_entries:
        issues.append(f"{empty_entries} section entries have no usable title or organization.")
        score -= min(12, empty_entries * 4)
    skills = resume.get("skills") or {}
    if sum(len(as_list(skills.get(key))) for key in ["technical", "tools", "languages"]) < 2:
        issues.append("Skills section is too thin for ATS use.")
        score -= 8
    if not resume.get("atsKeywords"):
        issues.append("ATS keyword list is empty.")
        score -= 5
    source = str(job.get("resumeText") or "")
    source_numbers = set(re.findall(r"\b\d{2,4}(?:[.,]\d+)?%?\b", source))
    generated_numbers = set(re.findall(r"\b\d{2,4}(?:[.,]\d+)?%?\b", json.dumps(resume, ensure_ascii=False)))
    unsupported_numbers = sorted(generated_numbers - source_numbers)
    if unsupported_numbers:
        issues.append(f"Potential unsupported numeric claims: {', '.join(unsupported_numbers[:8])}.")
        score -= min(20, len(unsupported_numbers) * 4)
    return {
        "score": max(0, min(100, score)),
        "passed": score >= RESUME_QUALITY_MIN,
        "minimum": RESUME_QUALITY_MIN,
        "issues": issues,
        "bulletCount": bullet_count,
        "sectionCounts": {
            "education": len(resume.get("education") or []),
            "experience": len(resume.get("experience") or []),
            "projects": len(resume.get("projects") or []),
            "extracurricular": len(resume.get("extracurricular") or []),
        },
        "unsupportedNumbers": unsupported_numbers,
    }


def generate_resume_with_quality(job):
    resume = call_openai_resume(job)
    report = resume_quality_report(resume, job)
    history = [{"stage": "draft", **report}]
    for attempt in range(1, RESUME_MAX_ATTEMPTS + 1):
        resume = audit_openai_resume(job, resume, report.get("issues"))
        report = resume_quality_report(resume, job)
        history.append({"stage": f"audit_{attempt}", **report})
        if report["passed"]:
            return resume, report, history
    raise RuntimeError(f"Resume quality gate failed after {RESUME_MAX_ATTEMPTS} audits: {report.get('issues')}")


def pdf_text(value):
    text = str(value or "").replace("\r", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text.encode("latin-1", "replace").decode("latin-1")


def wrap_text(text, max_chars):
    words = pdf_text(text).split()
    lines = []
    current = ""
    for word in words:
        if len(current) + len(word) + 1 > max_chars and current:
            lines.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    if current:
        lines.append(current)
    return lines or [""]


def escape_pdf(value):
    return pdf_text(value).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


class SimplePdf:
    def __init__(self, title):
        self.title = title
        self.pages = []
        self.new_page()

    def new_page(self):
        self.pages.append([])
        self.x = 54
        self.y = 790

    def ensure_space(self, needed=40):
        if self.y - needed < 54:
            self.new_page()

    def text(self, value, x=None, size=10, bold=False, leading=13):
        self.ensure_space(leading + 4)
        font = "F2" if bold else "F1"
        px = self.x if x is None else x
        self.pages[-1].append(f"BT /{font} {size} Tf {px} {self.y} Td ({escape_pdf(value)}) Tj ET")
        self.y -= leading

    def wrapped(self, value, x=None, size=10, bold=False, max_chars=92, bullet=False, leading=13):
        for line in wrap_text(value, max_chars):
            prefix = "- " if bullet else ""
            self.text(prefix + line, x=x, size=size, bold=bold, leading=leading)

    def line(self, x1=54, x2=558):
        self.ensure_space(12)
        self.pages[-1].append(f"{x1} {self.y} m {x2} {self.y} l S")
        self.y -= 12

    def gap(self, points=8):
        self.y -= points

    def render(self):
        objects = []
        objects.append("<< /Type /Catalog /Pages 2 0 R >>")
        kids = " ".join(f"{3 + i * 2} 0 R" for i in range(len(self.pages)))
        objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(self.pages)} >>")
        for i, commands in enumerate(self.pages):
            content_id = 4 + i * 2
            page = (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                f"/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> "
                f"/F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> "
                f"/Contents {content_id} 0 R >>"
            )
            stream = "0.7 w\n" + "\n".join(commands)
            objects.append(page)
            objects.append(f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream")
        body = ["%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"]
        offsets = [0]
        for index, obj in enumerate(objects, start=1):
            offsets.append(sum(len(part.encode("latin-1")) for part in body))
            body.append(f"{index} 0 obj\n{obj}\nendobj\n")
        xref = sum(len(part.encode("latin-1")) for part in body)
        body.append(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n")
        for offset in offsets[1:]:
            body.append(f"{offset:010d} 00000 n \n")
        body.append(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n")
        return "".join(body).encode("latin-1")


def entry_title(item, fallback):
    parts = [item.get("title") or item.get("degree") or item.get("name") or fallback]
    org = item.get("organization") or item.get("school") or item.get("role") or ""
    if org:
        parts.append(org)
    dates = item.get("dates") or ""
    if dates:
        parts.append(dates)
    return " | ".join(pdf_text(part) for part in parts if part)


def render_section(pdf, title, lines, visual=False):
    filtered = [line for line in lines if str(line or "").strip()]
    if not filtered:
        return
    pdf.gap(5 if visual else 3)
    pdf.text(title.upper(), size=11 if visual else 10, bold=True, leading=14)
    if visual:
        pdf.line()
    for line in filtered:
        pdf.wrapped(line, size=9.5 if visual else 10, max_chars=88 if visual else 96, bullet=line.startswith("- "), leading=12)


def collect_entry_lines(entries, fallback):
    lines = []
    for item in entries:
        lines.append(entry_title(item, fallback))
        bullets = item.get("bullets") or item.get("details") or []
        for bullet in as_list(bullets)[:5]:
            lines.append(f"- {bullet}")
    return lines


def labels_for_language(output_language):
    if output_language == "zh":
        return {
            "summary": "个人总结",
            "education": "教育背景",
            "experience": "工作经历",
            "projects": "项目经历",
            "extracurricular": "课外经历",
            "skills": "技能",
            "languages": "语言能力",
            "references": "推荐人",
            "education_visual": "教育背景",
            "experience_visual": "工作经历",
            "projects_visual": "项目经历",
            "extracurricular_visual": "课外活动",
            "skills_visual": "技能与语言",
        }
    return {
        "summary": "Professional Summary",
        "education": "Education",
        "experience": "Experience",
        "projects": "Projects",
        "extracurricular": "Extracurricular Activities",
        "skills": "Skills",
        "languages": "Languages",
        "references": "References",
        "education_visual": "Education Background",
        "experience_visual": "Work Experience",
        "projects_visual": "Project Experience",
        "extracurricular_visual": "Extracurricular Activities",
        "skills_visual": "Skills & Languages",
    }


def contains_cjk(value):
    return bool(re.search(r"[\u3400-\u9fff]", json.dumps(value, ensure_ascii=False)))


def wrap_by_chars(text, max_chars):
    text = re.sub(r"\s+", " ", str(text or "").strip())
    if not text:
        return [""]
    if " " in text and not contains_cjk(text):
        return wrap_text(text, max_chars)
    return [text[index : index + max_chars] for index in range(0, len(text), max_chars)]


def reportlab_available():
    try:
        import reportlab  # noqa: F401

        return True
    except Exception:
        return False


def render_reportlab_pdf(resume, output_language, visual=False):
    try:
        from reportlab.lib.colors import HexColor, black, white
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        from reportlab.pdfgen import canvas
    except Exception as exc:
        raise RuntimeError("Chinese PDF output requires reportlab. Install it with: pip3 install reportlab") from exc

    labels = labels_for_language(output_language)
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    font = "Helvetica"
    bold = "Helvetica-Bold"
    if output_language == "zh" or contains_cjk(resume):
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
        font = "STSong-Light"
        bold = "STSong-Light"
    y = height - 54
    navy = HexColor("#082451")
    accent = HexColor("#1F67D2")
    muted = HexColor("#4B5D78")

    def ensure(points=36):
        nonlocal y
        if y - points < 54:
            pdf.showPage()
            y = height - 54

    def draw_text(text, size=10, is_bold=False, leading=13, color=None):
        nonlocal y
        ensure(leading + 4)
        pdf.setFont(bold if is_bold else font, size)
        pdf.setFillColor(color or black)
        pdf.drawString(54, y, str(text or ""))
        y -= leading

    def draw_wrapped(text, size=10, is_bold=False, max_chars=88, bullet=False, leading=13, color=None):
        for line in wrap_by_chars(text, max_chars):
            draw_text(("- " if bullet else "") + line, size=size, is_bold=is_bold, leading=leading, color=color)

    def draw_line():
        nonlocal y
        ensure(12)
        pdf.setLineWidth(0.7)
        pdf.setStrokeColor(accent if visual else black)
        pdf.line(54, y, width - 54, y)
        y -= 12

    def draw_gap(points=6):
        nonlocal y
        y -= points

    def draw_section(title, lines):
        filtered = [line for line in lines if str(line or "").strip()]
        if not filtered:
            return
        draw_gap(5)
        draw_text(
            title.upper() if output_language != "zh" else title,
            size=11 if visual else 10,
            is_bold=True,
            leading=14,
            color=navy if visual else black,
        )
        if visual:
            draw_line()
        for line in filtered:
            draw_wrapped(line[2:] if line.startswith("- ") else line, size=9.5 if visual else 10, max_chars=48 if output_language == "zh" else 88, bullet=line.startswith("- "), leading=13)

    if visual:
        pdf.setFillColor(navy)
        pdf.rect(0, height - 112, width, 112, fill=1, stroke=0)
        y = height - 38
        draw_text(resume["name"].upper() if output_language != "zh" else resume["name"], size=21, is_bold=True, leading=26, color=white)
        if resume["headline"]:
            draw_wrapped(resume["headline"], size=10.5, is_bold=True, max_chars=78, leading=13, color=white)
        if resume["contactLine"]:
            draw_wrapped(resume["contactLine"], size=9.2, max_chars=82, leading=12, color=white)
        y = height - 132
    else:
        draw_text(resume["name"].upper() if output_language != "zh" else resume["name"], size=18, is_bold=True, leading=22)
        if resume["contactLine"]:
            draw_wrapped(resume["contactLine"], size=9.5, max_chars=90, leading=12, color=muted)
        if resume["headline"]:
            draw_wrapped(resume["headline"], size=10, is_bold=True, max_chars=86, leading=13, color=navy)
        draw_line()
    if visual:
        draw_section(labels["education_visual"], collect_entry_lines(resume["education"], "Education"))
        draw_section(labels["experience_visual"], collect_entry_lines(resume["experience"], "Experience"))
        draw_section(labels["projects_visual"], collect_entry_lines(resume["projects"], "Project"))
        draw_section(labels["extracurricular_visual"], collect_entry_lines(resume["extracurricular"], "Activity"))
    else:
        draw_section(labels["summary"], resume["summary"])
        draw_section(labels["education"], collect_entry_lines(resume["education"], "Education"))
        draw_section(labels["experience"], collect_entry_lines(resume["experience"], "Experience"))
        draw_section(labels["projects"], collect_entry_lines(resume["projects"], "Project"))

    skill_lines = []
    for label, values in resume["skills"].items():
        if values:
            skill_lines.append(f"{label.title()}: {', '.join(values)}")
    draw_section(labels["skills_visual"] if visual else labels["skills"], skill_lines)
    if not visual:
        draw_section(labels["languages"], resume["skills"].get("languages") or [])
    if visual:
        draw_section(labels["references"], resume["references"])
    pdf.save()
    return buffer.getvalue()


def render_ats_pdf(resume, output_language="en"):
    return render_reportlab_pdf(resume, output_language, visual=False)


def render_visual_pdf(resume, output_language="en"):
    return render_reportlab_pdf(resume, output_language, visual=True)


def validate_pdf_output(pdf_bytes, label):
    data = bytes(pdf_bytes or b"")
    page_count = len(re.findall(rb"/Type\s*/Page\b", data))
    checks = {
        "label": label,
        "bytes": len(data),
        "pageCount": page_count,
        "hasPdfHeader": data.startswith(b"%PDF-"),
        "hasEof": b"%%EOF" in data[-1024:],
    }
    checks["passed"] = checks["hasPdfHeader"] and checks["hasEof"] and checks["bytes"] >= 1800 and page_count >= 1
    if not checks["passed"]:
        raise RuntimeError(f"{label} PDF quality check failed: {checks}")
    return checks


def run_resume_job(job):
    log(f"Generating resume job {job['id']} target={job.get('targetRole')}")
    update_resume_job(job["id"], job["leaseToken"], "running", result={"stage": "drafting", "summary": "正在整理原始资料并生成结构化简历。"})
    resume, quality, quality_history = generate_resume_with_quality(job)
    update_resume_job(
        job["id"],
        job["leaseToken"],
        "running",
        result={
            "stage": "quality_passed",
            "summary": f"内容质量检查通过：{quality['score']}/{quality['minimum']}。正在生成两份 PDF。",
            "quality": quality,
        },
    )
    output_language = job.get("outputLanguage") or "en"
    ats_pdf = render_ats_pdf(resume, output_language)
    visual_pdf = render_visual_pdf(resume, output_language)
    pdf_validation = {
        "ats": validate_pdf_output(ats_pdf, "ATS"),
        "visual": validate_pdf_output(visual_pdf, "Visual"),
    }
    summary = f"已生成并验收 ATS 与视觉版两份 PDF：{resume.get('name') or 'resume'}。"
    result = {
        "pipelineVersion": "resume-v2-quality-gated",
        "stage": "completed",
        "summary": summary,
        "targetRole": job.get("targetRole", ""),
        "targetCountry": job.get("targetCountry", ""),
        "name": resume.get("name", ""),
        "atsKeywords": resume.get("atsKeywords", [])[:20],
        "qualityNotes": resume.get("qualityNotes", [])[:8],
        "quality": quality,
        "qualityHistory": quality_history,
        "pdfValidation": pdf_validation,
        "pdfBytes": {"ats": len(ats_pdf), "visual": len(visual_pdf)},
    }
    return result, ats_pdf, visual_pdf


def loop_once():
    payload = api_post("/api/resume-runner/next", {}, timeout=45)
    job = payload.get("job")
    if not job:
        return False
    job_id = job["id"]
    log(f"Pulled resume job {job_id} order={job.get('orderId')}")
    try:
        result, ats_pdf, visual_pdf = run_resume_job(job)
        update_resume_job(job_id, job["leaseToken"], "completed", result=result, ats_pdf=ats_pdf, visual_pdf=visual_pdf)
        log(f"Completed resume job {job_id}: {result.get('summary')}")
    except Exception as exc:
        tb = traceback.format_exc()
        log(f"Failed resume job {job_id}: {exc}\n{tb}")
        update_resume_job(job_id, job["leaseToken"], "failed", result={"trace": tb[-2000:]}, error=str(exc))
    return True


def main():
    if not RUNNER_SECRET:
        print("RUNNER_SECRET is required", file=sys.stderr)
        return 2
    if not OPENAI_API_KEY:
        print("OPENAI_API_KEY is required", file=sys.stderr)
        return 2
    log(f"Resume runner started. Base={BASE_URL}, model={OPENAI_TEXT_MODEL}, poll={POLL_SECONDS}s.")
    while True:
        try:
            had_job = loop_once()
            if not had_job:
                time.sleep(POLL_SECONDS)
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            log(f"Loop error: {exc}")
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
