from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "AgentGuard_Project_Brief.md"
OUTPUT = ROOT / "AgentGuard_Project_Brief.pdf"


def build_story(lines: list[str]) -> list:
    styles = getSampleStyleSheet()
    normal = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=15,
        spaceAfter=6,
        textColor=colors.HexColor("#0f172a"),
    )
    h1 = ParagraphStyle(
        "H1",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        spaceBefore=8,
        spaceAfter=12,
        textColor=colors.HexColor("#1e293b"),
    )
    h2 = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13.5,
        leading=18,
        spaceBefore=10,
        spaceAfter=7,
        textColor=colors.HexColor("#0f172a"),
    )
    bullet = ParagraphStyle(
        "Bullet",
        parent=normal,
        leftIndent=14,
        bulletIndent=2,
        spaceAfter=4,
    )

    story = []
    for raw in lines:
        line = raw.rstrip()
        if not line:
            story.append(Spacer(1, 4))
            continue

        if line.startswith("# "):
            story.append(Paragraph(line[2:].strip(), h1))
            continue

        if line.startswith("## "):
            story.append(Paragraph(line[3:].strip(), h2))
            continue

        if line.startswith("- "):
            story.append(Paragraph(line[2:].strip(), bullet, bulletText="•"))
            continue

        story.append(Paragraph(line, normal))

    return story


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Source brief not found: {SOURCE}")

    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    story = build_story(lines)

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="AgentGuard Project Brief",
        author="AgentGuard",
    )
    doc.build(story)

    print(str(OUTPUT))


if __name__ == "__main__":
    main()
