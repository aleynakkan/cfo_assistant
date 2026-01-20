# app/services/categorization.py

import re
import unicodedata
import json
import os
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# === Load merchant map ===
MERCHANT_MAP = {}
MERCHANT_KEYS = []
RAPIDFUZZ_AVAILABLE = False

try:
    from rapidfuzz import process
    RAPIDFUZZ_AVAILABLE = True
except ImportError:
    logger.warning("rapidfuzz not installed. Fuzzy merchant matching disabled.")

# Load merchant canonical map
try:
    merchant_map_path = os.path.join(os.path.dirname(__file__), 'data', 'merchant_map.json')
    with open(merchant_map_path, 'r', encoding='utf-8') as f:
        MERCHANT_MAP = json.load(f)
        # Filter out comments
        MERCHANT_MAP = {k: v for k, v in MERCHANT_MAP.items() if not k.startswith('_')}
        MERCHANT_KEYS = list(MERCHANT_MAP.keys())
    logger.info(f"Loaded {len(MERCHANT_MAP)} merchant mappings")
except FileNotFoundError:
    logger.warning("merchant_map.json not found. Merchant matching disabled.")
except Exception as e:
    logger.error(f"Error loading merchant_map.json: {e}")


def normalize(description: Optional[str]) -> str:
    """
    Robust text normalization for transaction descriptions.
    
    Steps:
    1. Unicode normalize (NFKD) and strip combining diacritics
    2. Convert to uppercase
    3. Remove punctuation (keep spaces and alphanumeric)
    4. Remove transaction IDs (TRX, REF patterns)
    5. Apply Turkish character replacements
    6. Collapse whitespace
    
    Examples:
        "SHELL İSTANBUL 1234" → "SHELL ISTANBUL 1234"
        "Maaş Ödemesi REF:5678" → "MAAS ODEMESI"
        "POS Garanti - 123.45 TL" → "POS GARANTI TL"
    """
    if not description or not description.strip():
        return ""
    
    # Step 1: Unicode normalization (NFKD) to decompose combined characters
    text = unicodedata.normalize('NFKD', description)
    
    # Step 2: Remove combining diacritics
    text = ''.join(ch for ch in text if not unicodedata.combining(ch))
    
    # Step 3: Convert to uppercase
    text = text.upper()
    
    # Step 4: Turkish character replacements (some may remain after NFKD)
    replacements = {
        'İ': 'I', 'İ': 'I', 'I': 'I',  # Turkish uppercase I
        'Ş': 'S', 'Ş': 'S',
        'Ğ': 'G', 'Ğ': 'G',
        'Ü': 'U', 'Ü': 'U',
        'Ö': 'O', 'Ö': 'O',
        'Ç': 'C', 'Ç': 'C',
        'MAAŞ': 'MAAS',
        'İŞBANK': 'ISBANK',
        'YAPI KREDİ': 'YAPIKREDI',
        'ÖDEME': 'ODEME',
        'ÖDEMESI': 'ODEMESI',
        'TAHSİLAT': 'TAHSILAT',
        'KİRA': 'KIRA',
        'VERGİ': 'VERGI',
        'ELEKTRİK': 'ELEKTRIK',
        'SİGORTA': 'SIGORTA',
        'KIRTASİYE': 'KIRTASIYE',
        'OFİS': 'OFIS',
    }
    
    for old, new in replacements.items():
        text = text.replace(old, new)
    
    # Step 5: Remove transaction IDs and reference codes
    # Pattern: TRX followed by digits, REF: followed by digits, timestamps
    text = re.sub(r'\bTRX\d+\b', '', text)
    text = re.sub(r'\bREF:\s*\d+\b', '', text)
    text = re.sub(r'\bREF\s*\d+\b', '', text)
    text = re.sub(r'\b\d{2}[./]\d{2}[./]\d{4}\b', '', text)  # dates
    text = re.sub(r'\b\d{4,}\b', '', text)  # long number sequences (likely IDs)
    
    # Step 6: Remove punctuation but keep alphanumeric and spaces
    text = re.sub(r'[^\w\s]', ' ', text)
    
    # Step 7: Collapse multiple spaces
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text


def lookup_merchant_fuzzy(text: str) -> tuple[Optional[str], int, str]:
    """
    Fuzzy lookup merchant in merchant_map.
    
    Returns:
        (category, confidence, method) tuple
        - category: matched category or None
        - confidence: 0-100 score
        - method: "merchant_map", "fuzzy_merchant", or None
    """
    if not MERCHANT_KEYS or not RAPIDFUZZ_AVAILABLE or not text:
        return None, 0, None
    
    # Try exact match first (case-insensitive already handled by normalize)
    for key in MERCHANT_KEYS:
        if key in text:
            category = MERCHANT_MAP[key]
            return category, 96, "merchant_map"
    
    # Fuzzy match with high threshold
    result = process.extractOne(text, MERCHANT_KEYS, score_cutoff=80)
    if result:
        matched_key, score, _ = result
        category = MERCHANT_MAP[matched_key]
        
        if score >= 90:
            return category, 94, "merchant_map"
        elif score >= 80:
            return category, 88, "fuzzy_merchant"
    
    # Medium confidence fuzzy match (threshold raised to 70 to avoid false positives)
    result = process.extractOne(text, MERCHANT_KEYS, score_cutoff=70)
    if result:
        matched_key, score, _ = result
        category = MERCHANT_MAP[matched_key]
        
        if score >= 75:
            return category, 80, "fuzzy_merchant"
        elif score >= 70:
            return category, 72, "fuzzy_merchant"
    
    return None, 0, None


def categorize_with_confidence(
    description: Optional[str],
    amount: float,
    direction: str,
) -> Dict[str, any]:
    """
    Enhanced hybrid categorization: Merchant Map + Pattern + Amount Heuristics + Confidence Scoring
    
    Priority order:
    1. Merchant map (exact/fuzzy) - highest confidence
    2. Pattern matching - high confidence
    3. Amount heuristics - medium confidence
    4. Fallback - low confidence
    
    Returns:
        {
            "category": str,
            "confidence": float (0-100),
            "method": str ("merchant_map", "fuzzy_merchant", "pattern", "heuristic", "fallback")
        }
    """
    if not description or not description.strip():
        return {
            "category": "DIGER_GELIR" if direction == "in" else "DIGER_GIDER",
            "confidence": 30,
            "method": "fallback"
        }

    # Normalize description
    text = normalize(description)
    
    # === PRIORITY 1: MERCHANT MAP LOOKUP ===
    merchant_category, merchant_confidence, merchant_method = lookup_merchant_fuzzy(text)
    if merchant_category:
        return {
            "category": merchant_category,
            "confidence": merchant_confidence,
            "method": merchant_method
        }
    
    # === PRIORITY 2: PATTERN MATCHING (High Confidence) ===
    
    # POS / Tahsilat gelirleri
    if re.search(r"POS\s+GARANT|GARANT\s+POS", text):
        return {"category": "POS_GELIRI", "confidence": 95, "method": "pattern"}
    if re.search(r"POS\s+YKB|YAPI KRED\s+POS|YAPIKREDI\s+POS", text):
        return {"category": "POS_GELIRI", "confidence": 95, "method": "pattern"}
    if re.search(r"POS\s+ISBANK|ISBANK\s+POS", text):
        return {"category": "POS_GELIRI", "confidence": 95, "method": "pattern"}
    if re.search(r"POS\s+AKBANK|AKBANK\s+POS", text):
        return {"category": "POS_GELIRI", "confidence": 95, "method": "pattern"}
    if "POS" in text and direction == "in":
        return {"category": "POS_GELIRI", "confidence": 88, "method": "pattern"}
    
    # EFT/Havale tahsilat (gelir)
    if direction == "in" and any(kw in text for kw in ["TAHSILAT", "EFT", "HAVALE", "HVL"]):
        return {"category": "EFT_TAHSILAT", "confidence": 92, "method": "pattern"}
    
    # Generic transfer keywords (lower confidence for outgoing)
    if direction == "out" and any(kw in text for kw in ["ODEME", "ODEMESI"]):
        # Don't auto-categorize outgoing payments, let heuristics handle
        pass

    # Online satış
    if any(kw in text for kw in ["ONLINE SAT", "E TICARET", "ETICARET"]):
        return {"category": "ONLINE_SATIS", "confidence": 90, "method": "pattern"}

    # Sabit Giderler
    if "KIRA" in text:
        return {"category": "KIRA", "confidence": 95, "method": "pattern"}
    
    if "MAAS" in text or "PERSONEL MAA" in text or "UCRET ODEMESI" in text:
        return {"category": "MAAS", "confidence": 95, "method": "pattern"}

    # Vergi / SGK
    if any(kw in text for kw in ["VERGI", "KDV", "SGK", "MUHTASAR", "GELIR VERGISI", "KURUMLAR VERGISI"]):
        return {"category": "VERGI", "confidence": 95, "method": "pattern"}

    # Utilities
    if "ELEKTRIK" in text or "CK ENERJI" in text or "BEDAS" in text or "AYEDAS" in text:
        return {"category": "ELEKTRIK", "confidence": 92, "method": "pattern"}

    if "SU FATURASI" in text or "SU BEDELI" in text or "ISKI" in text or "ASKI" in text:
        return {"category": "SU", "confidence": 92, "method": "pattern"}

    if any(kw in text for kw in ["INTERNET", "SUPERONLINE", "TURKCELL", "TTNET", "VODAFONE"]):
        return {"category": "INTERNET", "confidence": 92, "method": "pattern"}

    # Sigorta
    if "SIGORTA" in text:
        return {"category": "SIGORTA", "confidence": 90, "method": "pattern"}

    # Ofis malzemesi
    if any(kw in text for kw in ["KIRTASIYE", "OFIS MALZ"]):
        return {"category": "OFIS_MALZEME", "confidence": 88, "method": "pattern"}

    # Bakım/Onarım
    if any(kw in text for kw in ["BAKIM", "ONARIM", "TAMIR"]):
        return {"category": "BAKIM_ONARIM", "confidence": 88, "method": "pattern"}

    # Pazarlama/Reklam
    if any(kw in text for kw in ["PAZARLAMA", "REKLAM", "ADVERTISING", "GOOGLE", "FACEBOOK", "INSTAGRAM", "META"]):
        return {"category": "PAZARLAMA", "confidence": 90, "method": "pattern"}

    # === PRIORITY 3: AMOUNT HEURISTICS (Medium-Low Confidence) ===
    # Updated to 2026 Turkish economy reality
    
    if direction == "out":
        # Expense side
        if amount > 25000:
            # Large amounts: likely rent, payroll, tax, large purchases
            if any(kw in text for kw in ["ALIS", "SATIN", "TEDARIK"]):
                return {"category": "DIGER_GIDER", "confidence": 60, "method": "heuristic"}
            return {"category": "DIGER_GIDER", "confidence": 55, "method": "heuristic"}
        
        elif 2500 < amount <= 25000:
            # Medium amounts: supplier invoices, equipment, services
            if any(kw in text for kw in ["FATURA", "INVOICE"]):
                return {"category": "DIGER_GIDER", "confidence": 58, "method": "heuristic"}
            return {"category": "DIGER_GIDER", "confidence": 52, "method": "heuristic"}
        
        elif 250 < amount <= 2500:
            # Small amounts: logistics, fuel, small services
            if any(kw in text for kw in ["KARGO", "NAKLIYE", "KURYE"]):
                return {"category": "KARGO", "confidence": 65, "method": "heuristic"}
            if any(kw in text for kw in ["YAKIT", "BENZIN", "MOTORIN"]):
                return {"category": "AKARYAKIT", "confidence": 65, "method": "heuristic"}
            return {"category": "DIGER_GIDER", "confidence": 50, "method": "heuristic"}
        
        else:  # amount <= 250
            # Micro amounts: office supplies, small purchases
            if any(kw in text for kw in ["MARKET", "BAKKAL", "MANAV", "KAHVE"]):
                return {"category": "OFIS_MALZEME", "confidence": 62, "method": "heuristic"}
            return {"category": "DIGER_GIDER", "confidence": 48, "method": "heuristic"}
    
    else:  # direction == "in"
        # Income side
        if amount >= 5000:
            # Large income: likely bank transfers, B2B sales
            return {"category": "EFT_TAHSILAT", "confidence": 70, "method": "heuristic"}
        elif amount >= 1000:
            # Medium income: could be sales or transfers
            return {"category": "EFT_TAHSILAT", "confidence": 62, "method": "heuristic"}
        else:
            # Small income
            return {"category": "DIGER_GELIR", "confidence": 55, "method": "heuristic"}

    # === FALLBACK ===
    return {
        "category": "DIGER_GELIR" if direction == "in" else "DIGER_GIDER",
        "confidence": 30,
        "method": "fallback"
    }


def categorize_transaction(
    description: Optional[str],
    amount: float,
    direction: str,
) -> Optional[str]:
    """
    Backward-compatible wrapper. Returns only category string.
    """
    result = categorize_with_confidence(description, amount, direction)
    return result["category"]

