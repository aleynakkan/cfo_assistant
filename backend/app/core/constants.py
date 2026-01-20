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

# Sabit gider kategorileri (ayda tekrar eden, tutarları stabil olanlar)
FIXED_COST_CATEGORIES = {
    "KIRA",
    "MAAS",
    "AKARYAKIT",
    "ELEKTRIK",
    "SU",
    "INTERNET",
    "VERGI",
    "SIGORTA",
    "DIGER_GIDER",
}

# Gelir kategorileri (gider analizlerinden hariç tutulmalı)
INCOME_CATEGORIES = {
    "POS_GELIRI",
    "EFT_TAHSILAT",
    "ONLINE_SATIS",
    "DIGER_GELIR",
}

# Anomali tespit için eşik değeri (% olarak)
ANOMALY_THRESHOLD = 20  # %20 üzeri artış = anomali
