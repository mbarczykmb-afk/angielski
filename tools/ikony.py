#!/usr/bin/env python3
"""Generator ikon PWA dla Angielski AI.

Rysuje dymek rozmowy — bez zewnętrznych bibliotek, sam zlib i struct,
żeby ikony dały się odtworzyć na każdej maszynie.

    python3 tools/ikony.py
"""
import struct
import zlib
from pathlib import Path

TLO = (13, 17, 23, 255)        # #0d1117
DYMEK = (29, 158, 117, 255)    # #1D9E75
LINIA = (232, 250, 244, 255)   # jasny akcent na dymku

WYJSCIE = Path(__file__).resolve().parent.parent / "web" / "icons"


def w_zaokraglonym(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    # Środkowy krzyż zawsze należy do figury
    if x0 + r <= x <= x1 - r or y0 + r <= y <= y1 - r:
        return True
    # Poza krzyżem liczy się odległość od środka najbliższego rogu
    cx = x0 + r if x < x0 + r else x1 - r
    cy = y0 + r if y < y0 + r else y1 - r
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def w_trojkacie(px, py, a, b, c):
    def znak(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1 = znak((px, py), a, b)
    d2 = znak((px, py), b, c)
    d3 = znak((px, py), c, a)
    ujemne = (d1 < 0) or (d2 < 0) or (d3 < 0)
    dodatnie = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (ujemne and dodatnie)


def narysuj(rozmiar, maskowalna=False):
    s = rozmiar / 512.0
    # Ikona maskowalna musi zmieścić się w bezpiecznym kole — zmniejszamy rysunek
    skala = 0.78 if maskowalna else 1.0
    przesuniecie = (1 - skala) * 256

    def sk(v):
        return (v * skala + przesuniecie) * s

    bx0, by0, bx1, by1, br = sk(72), sk(112), sk(440), sk(360), sk(64)
    ogon = ((sk(150), sk(352)), (sk(250), sk(352)), (sk(160), sk(440)))

    linie = [
        (sk(128), sk(178), sk(384), sk(214), sk(18)),
        (sk(128), sk(240), sk(330), sk(276), sk(18)),
    ]

    piksele = bytearray()
    for y in range(rozmiar):
        piksele.append(0)  # typ filtra PNG: brak
        for x in range(rozmiar):
            kolor = TLO
            if w_zaokraglonym(x, y, bx0, by0, bx1, by1, br) or w_trojkacie(x, y, *ogon):
                kolor = DYMEK
            for lx0, ly0, lx1, ly1, lr in linie:
                if w_zaokraglonym(x, y, lx0, ly0, lx1, ly1, lr):
                    kolor = LINIA
                    break
            piksele.extend(kolor)
    return bytes(piksele)


def zapisz_png(sciezka, rozmiar, surowe):
    def kawalek(typ, dane):
        return (struct.pack(">I", len(dane)) + typ + dane +
                struct.pack(">I", zlib.crc32(typ + dane) & 0xFFFFFFFF))

    naglowek = struct.pack(">IIBBBBB", rozmiar, rozmiar, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (b"\x89PNG\r\n\x1a\n" +
           kawalek(b"IHDR", naglowek) +
           kawalek(b"IDAT", zlib.compress(surowe, 9)) +
           kawalek(b"IEND", b""))
    sciezka.write_bytes(png)
    print(f"  {sciezka.name}  ({len(png) // 1024} KB)")


def main():
    WYJSCIE.mkdir(parents=True, exist_ok=True)
    print("Generuję ikony:")
    for rozmiar in (192, 512):
        zapisz_png(WYJSCIE / f"ikona-{rozmiar}.png", rozmiar, narysuj(rozmiar))
    zapisz_png(WYJSCIE / "ikona-maskowalna-512.png", 512, narysuj(512, maskowalna=True))
    print("Gotowe.")


if __name__ == "__main__":
    main()
