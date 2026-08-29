#!/usr/bin/env python3
"""Extract the standardised Ligue 1 club pages from the official DNCG PDF.

The report is structured visually rather than as a data file.  pdfplumber keeps
the left/right club columns separate and this script maps the published labels
to Footato's deliberately small financial schema.  Values remain in K€.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pdfplumber


NUMBER = r"(-?\d(?:[\d ]*\d)?)"


def value(text: str, labels: list[str]) -> int | None:
    for label in labels:
        match = re.search(rf"{label}\s+{NUMBER}(?:\s|$)", text, re.IGNORECASE)
        if match:
            return int(match.group(1).replace(" ", ""))
    return None


FIELDS = {
    "revenue": [r"TOTAL NON-TRANSFER EARNINGS"],
    "broadcasting": [r"Broadcasting rights"],
    "commercial": [r"Sponsors\s*-\s*Advertising"],
    "matchday": [r"Gate receipts"],
    "otherRevenue": [r"Other income"],
    "payroll": [r"Total payroll"],
    "playerAmortisation": [r"Amortisation of transfer fees"],
    "agentFees": [r"Players' agents\s*/\s*Intermediaries fees"],
    "operatingExpenses": [r"TOTAL NON-TRANSFER EXPENSES"],
    "operatingResult": [r"OPERATING RESULT \(LOSS\)"],
    "playerTrading": [r"PROFIT \(LOSS\) FROM TRANSFERS"],
    "preTaxResult": [r"PROFIT \(LOSS\) BEFORE TAX"],
    "netResult": [r"NET PROFIT \(LOSS\)"],
    "intangibleAssets": [r"Intangible assets\s*:\s*transfer fees"],
    "transferReceivables": [r"Receivables on player transfers"],
    "cash": [r"Cash and marketable securities"],
    "totalAssets": [r"TOTAL ASSETS"],
    "equity": [r"Net equity"],
    "shareholderLoans": [r"Shareholder current accounts"],
    "financialDebt": [r"Financial debts"],
    "transferPayables": [r"Debts on player transfers"],
    "totalLiabilities": [r"TOTAL LIABILITIES"],
}


def standard_metrics(text: str) -> dict[str, int | None]:
    metrics = {field: value(text, labels) for field, labels in FIELDS.items()}

    # Monaco and Rennes publish player costs in the transfer block.  The labels
    # are the same, so only the location changes and the generic regex suffices.
    return metrics


def lyon_metrics(text: str) -> dict[str, int | None]:
    """OL uses consolidated IFRS statements with a different presentation."""
    return {
        "revenue": value(text, [r"INCOME FROM ACTIVITIES \(EXCLUDING PLAYER TRADING\)"]),
        "broadcasting": None,
        "commercial": None,
        "matchday": None,
        "otherRevenue": None,
        "payroll": abs(value(text, [r"Personnel costs"]) or 0),
        "playerAmortisation": None,
        "agentFees": None,
        "operatingExpenses": None,
        "operatingResult": value(text, [r"OPERATING PROFIT"]),
        "playerTrading": None,
        "preTaxResult": value(text, [r"PROFIT \(LOSS\) BEFORE TAX"]),
        "netResult": value(text, [r"NET PROFIT"]),
        "intangibleAssets": value(text, [r"Player registrations"]),
        "transferReceivables": None,
        "cash": value(text, [r"Cash and cash equivalents"]),
        "totalAssets": value(text, [r"TOTAL ASSETS"]),
        "equity": value(text, [r"TOTAL EQUITY"]),
        "shareholderLoans": None,
        "financialDebt": None,
        "transferPayables": None,
        "totalLiabilities": value(text, [r"TOTAL LIABILITIES"]),
    }


def crop_text(page, side: str) -> str:
    if side == "full":
        return page.extract_text() or ""
    width, height = page.width, page.height
    box = (0, 0, width / 2, height) if side == "left" else (width / 2, 0, width, height)
    return page.crop(box).extract_text() or ""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--registry", default="data/finance/registry.json")
    parser.add_argument("--out", default="data/finance/generated/fr-2023.json")
    args = parser.parse_args()

    registry = json.loads(Path(args.registry).read_text(encoding="utf-8"))["france"]
    records = []
    with pdfplumber.open(args.pdf) as document:
        for club in registry["clubs"]:
            text = crop_text(document.pages[club["pdfPage"] - 1], club["side"])
            metrics = club.get("reviewedMetrics") or (
                lyon_metrics(text) if club.get("layout") == "lyon" else standard_metrics(text)
            )
            required = ("revenue", "payroll", "operatingResult", "netResult", "cash", "totalAssets", "equity")
            missing = [field for field in required if metrics[field] is None]
            if missing:
                raise RuntimeError(f"{club['name']}: champs introuvables: {', '.join(missing)}")
            records.append({
                "id": club["id"],
                "name": club["name"],
                "country": "France",
                "countryCode": "FR",
                "league": "Ligue 1",
                "periodEnd": registry["periodEnd"],
                "currency": registry["currency"],
                "balanceConvention": "assets-equals-liabilities",
                "scope": "Périmètre déclaré par le club" if club.get("layout") != "lyon" else "Comptes consolidés du groupe OL",
                "quality": "extracted" if club.get("layout") != "lyon" else "reviewed",
                "reviewNote": "Extraction du tableau standard DNCG." if club.get("layout") != "lyon" else "Présentation IFRS spécifique ; les postes non comparables sont laissés vides.",
                "metrics": metrics,
            })

    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK DNCG : {len(records)} clubs extraits vers {output}")


if __name__ == "__main__":
    main()
