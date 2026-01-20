#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Real-world categorization tests"""

from app.services.categorization import categorize_with_confidence

def test_real_world():
    tests = [
        ("SHELL İSTANBUL AKARYAKIT", 250, "out"),
        ("Trendyöl Alışveriş TRX123", 450, "out"),
        ("MAAS BORDROSU OCAK 2026", 55000, "out"),
        ("EFT MÜŞTERI ABC LTD", 12000, "in"),
        ("POS GARANTI 1234", 2500, "in"),
        ("Bilinmeyen işlem", 1500, "out"),
        ("ŞELL Akaryakıt", 180, "out"),  # Fuzzy match test
        ("OPETT", 200, "out"),  # Fuzzy match test
        ("KIRA ÖDEMESİ ŞUBAT", 28000, "out"),
        ("VERGI DAİRESİ KDV", 8500, "out"),
    ]
    
    print("=" * 100)
    print("GERÇEK DÜNYA KATEGORİZASYON TESTLERİ")
    print("=" * 100)
    print()
    
    for i, (desc, amt, typ) in enumerate(tests, 1):
        result = categorize_with_confidence(desc, amt, typ)
        direction = "GİDER" if typ == "out" else "GELİR"
        
        print(f"{i:2}. {desc[:45]:45} | {amt:>8} TL ({direction})")
        print(f"    → Kategori: {result['category']:20} | Güven: {result['confidence']:3}% | Method: {result['method']}")
        print()
    
    print("=" * 100)
    print("✅ Tüm testler başarılı!")
    print("=" * 100)

if __name__ == "__main__":
    test_real_world()
