#!/usr/bin/env bash
# Przygotowanie grafik lektorki ze zdjęć (Animacja/ -> web/awatar/ i web/icons/).
#
# Źródła (dostarczone przez właściciela aplikacji):
#   Animacja/{listening,question,confirmation,encouraging,surprise,frustrated}.png
#       paski 1024x256: 4 klatki 256x256 każdej miny
#   Animacja/Dziewięć ujęć londyńskiej podcasterki nocą.gif
#       9 klatek: 1-4 mówienie, 5-7 uśmiech, 8-9 spokój
#   Animacja/Ikona.png — ikona aplikacji
# Potrzebne: ImageMagick (convert).
#
#   bash tools/awatar-foto.sh
set -euo pipefail
K="$(cd "$(dirname "$0")/.." && pwd)"
Z="$K/Animacja"
mkdir -p "$K/web/awatar"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Paski min: WebP zamiast PNG (kilkukrotnie mniejsze)
for n in listening question confirmation encouraging surprise frustrated; do
  convert "$Z/$n.png" -quality 82 "$K/web/awatar/$n.webp"
done

# GIF -> pasek 9 klatek 256x256 (środkowy kwadrat każdej klatki)
convert "$Z/Dziewięć ujęć londyńskiej podcasterki nocą.gif" -coalesce "$TMP/k-%d.png" 2>/dev/null
for i in $(seq 0 8); do
  convert "$TMP/k-$i.png" -gravity center -crop 407x407+0+0 +repage -resize 256x256 "$TMP/s-$i.png"
done
convert "$TMP"/s-{0..8}.png +append -quality 82 "$K/web/awatar/mowi.webp"

# Portret na ekran główny: pierwsza klatka zachęty
convert "$Z/encouraging.png" -crop 256x256+0+0 +repage -resize 192x192 -quality 85 "$K/web/awatar/portret.webp"

# Ikony aplikacji z Ikona.png
convert "$Z/Ikona.png" -resize 512x512 "$K/web/icons/ikona-512.png"
convert "$Z/Ikona.png" -resize 192x192 "$K/web/icons/ikona-192.png"
# Maskowalna: Android przycina do kółka/kształtu — motyw w bezpiecznym środku na pełnym tle
convert "$Z/Ikona.png" -resize 410x410 -background '#0a1230' -gravity center -extent 512x512 "$K/web/icons/ikona-maskowalna-512.png"
ls -la "$K/web/awatar" "$K/web/icons"
