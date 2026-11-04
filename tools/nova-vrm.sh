#!/usr/bin/env bash
# Przygotowanie modelu lektorki Nova (web/modele/nova.vrm.gz).
#
# Bierze przykładowy awatar pixiv (VRM Public License 1.0: wolno używać,
# zmieniać i rozpowszechniać, także komercyjnie), przebarwia go na „asystentkę
# AI” (platynowe włosy, turkusowe oczy, granatowe ubranie), zmniejsza tekstury
# i pakuje gzipem. Potrzebne: curl, ImageMagick (convert), python3, gzip.
#
#   bash tools/nova-vrm.sh
set -euo pipefail

KATALOG="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL -o "$TMP/zrodlo.vrm" \
  "https://raw.githubusercontent.com/pixiv/three-vrm/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm"

# Wyjęcie tekstur do plików NN_nazwa.png
mkdir -p "$TMP/img" "$TMP/nowe"
python3 -I - "$TMP/zrodlo.vrm" "$TMP/img" <<'EOF'
import json, struct, sys, os
b = open(sys.argv[1], 'rb').read()
n = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + n])
start = 20 + n + 8
for i, im in enumerate(j['images']):
    bv = j['bufferViews'][im['bufferView']]
    o = start + bv.get('byteOffset', 0)
    open(os.path.join(sys.argv[2], f"{i:02d}_{im['name']}.png"), 'wb').write(b[o:o + bv['byteLength']])
EOF

cd "$TMP/img"
WLOSY=(-colorspace Gray -auto-level -colorspace sRGB +level-colors '#7d8699','#fbfcff')
UBRANIE=(-colorspace Gray -colorspace sRGB +level-colors '#05070d','#1d2433')
convert 05_HairBack_00.png -resize 512x512 "${WLOSY[@]}" -quality 88 "$TMP/nowe/05.jpg"
convert 15_Hair_00.png -resize 512x1024 "${WLOSY[@]}" -quality 88 "$TMP/nowe/15.jpg"
convert 08_EyeIris_00.png -resize 512x256 -colorspace Gray -auto-level -colorspace sRGB +level-colors '#021620','#86f6ff' -quality 92 "$TMP/nowe/08.jpg"
convert 04_Tops_01.png -resize 512x1024 "${UBRANIE[@]}" -quality 85 "$TMP/nowe/04.jpg"
convert 02_Bottoms_01.png -resize 128x128 "${UBRANIE[@]}" -quality 80 "$TMP/nowe/02.jpg"
convert 03_Shoes_01.png -resize 128x128 -quality 80 "$TMP/nowe/03.jpg"
convert 00_Body_00.png -resize 1024x1024 -quality 85 "$TMP/nowe/00.jpg"
# Dorosła twarz: pełne usta z delikatną szminką zamiast kreski, mniejsze rumieńce
convert 09_Face_00.png \
  \( -size 1024x1024 xc:none -fill 'rgba(250,235,222,0.85)' -draw "ellipse 350,560 70,40 0,360" -draw "ellipse 675,560 70,40 0,360" -blur 0x10 \) -composite \
  \( -size 1024x1024 xc:none -fill 'rgb(246,229,216)' -draw "rectangle 438,772 592,787" -blur 0x1.5 \) -composite \
  \( -size 1024x1024 xc:none -fill 'rgba(194,98,116,0.66)' \
     -draw "path 'M 460,782 C 478,776 490,766 503,768 C 509,768 512,771 515,772 C 518,771 521,768 527,768 C 540,766 552,776 570,782 Q 515,786 460,782 Z'" \
     -draw "path 'M 462,783 C 480,806 550,806 568,783 Q 515,789 462,783 Z'" -blur 0x1.8 \) -composite \
  \( -size 1024x1024 xc:none -fill 'rgba(255,240,240,0.4)' -draw "ellipse 518,795 15,3 0,360" -draw "ellipse 512,773 7,1.5 0,360" -blur 0x1.6 \) -composite \
  \( -size 1024x1024 xc:none -stroke 'rgba(118,48,64,0.9)' -strokewidth 2.4 -fill none -draw "path 'M 460,782 Q 515,788 570,782'" -blur 0x0.6 \) -composite \
  09_Face_00.png

for i in 07_FaceMouth_00 09_Face_00 11_EyeWhite_00 12_FaceEyeline_00 13_FaceBrow_00 14_EyeHighlight_00; do
  convert "$i.png" -resize '1024x1024>' -quality 90 "$TMP/nowe/${i:0:2}.jpg"
done
convert 10_Face_00_outline.png -quality 90 "$TMP/nowe/10.jpg"
convert 17_Hair_00_spe.png -resize 256x512 -quality 88 "$TMP/nowe/17.jpg"
# Mapy normalnych i miniatura — zastąpione maleńkimi obrazkami
for n in 01 06 16 18; do convert -size 4x4 xc:'#8080ff' "$TMP/nowe/$n.png"; done

python3 -I "$KATALOG/tools/przebuduj_vrm.py" "$TMP/zrodlo.vrm" "$TMP/nowe" "$TMP/nova.vrm"
gzip -9 -n -c "$TMP/nova.vrm" > "$KATALOG/web/modele/nova.vrm.gz"
ls -la "$KATALOG/web/modele/nova.vrm.gz"
