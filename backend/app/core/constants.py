# app/core/constants.py

# Tüm kategori seçenekleri
CATEGORIES = [
    "POS_GELIRI",
    "EFT_TAHSILAT",
    "ONLINE_SATIS",
    "KIRA",
    "MAAS",
    "AKARYAKIT",
    "KARGO",
    "ELEKTRIK",
    "SU",
    "INTERNET",
    "VERGI",
    "SIGORTA",
    "OFIS_MALZEME",
    "DIGER_GELIR",
    "DIGER_GIDER",
]

# Gelir kategorileri
INCOME_CATEGORIES = {
    "POS_GELIRI",
    "EFT_TAHSILAT",
    "ONLINE_SATIS",
    "DIGER_GELIR",
}

# Sabit gider kategorileri (ayda tekrar eden, tutarları stabil olanlar)
FIXED_COST_CATEGORIES = {
    "KIRA",
    "MAAS",
    "AKARYAKIT",
    "KARGO",
    "ELEKTRIK",
    "SU",
    "INTERNET",
    "VERGI",
    "SIGORTA",
}

# Değişken gider kategorileri (düzensiz, tek seferlik giderler)
VARIABLE_COST_CATEGORIES = {
    "OFIS_MALZEME",
    "DIGER_GIDER",
}

# Tüm gider kategorileri
EXPENSE_CATEGORIES = FIXED_COST_CATEGORIES | VARIABLE_COST_CATEGORIES

# Anomali tespit için eşik değeri (% olarak)
ANOMALY_THRESHOLD = 20  # %20 üzeri artış = anomali
