# Przebudowa VRM: podmiana tekstur, bez map normalnych i miniatury
import json, struct, sys, os
zrodlo, katalog, cel = sys.argv[1:4]
b = open(zrodlo, 'rb').read()
n = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + n])
bin0 = 20 + n + 8
binlen = struct.unpack('<I', b[20 + n:24 + n])[0]
BIN = b[bin0:bin0 + binlen]

nowe = {}
for f in os.listdir(katalog):
    nowe[int(f[:2])] = (open(os.path.join(katalog, f), 'rb').read(), 'image/jpeg' if f.endswith('.jpg') else 'image/png')

widok_obrazu = {}
for i, im in enumerate(j['images']):
    if i in nowe:
        widok_obrazu[im['bufferView']] = i
        im['mimeType'] = nowe[i][1]

# Mapy normalne wyłączone — w małym kółku nic nie wnoszą, a ważą najwięcej
for m in j['materials']:
    m.pop('normalTexture', None)
meta = j['extensions']['VRMC_vrm']['meta']
meta.pop('thumbnailImage', None)

wynik = bytearray()
for k, bv in enumerate(j['bufferViews']):
    if k in widok_obrazu:
        dane = nowe[widok_obrazu[k]][0]
    else:
        o = bv.get('byteOffset', 0)
        dane = BIN[o:o + bv['byteLength']]
    while len(wynik) % 4:
        wynik.append(0)
    bv['byteOffset'] = len(wynik)
    bv['byteLength'] = len(dane)
    wynik += dane
while len(wynik) % 4:
    wynik.append(0)
j['buffers'][0]['byteLength'] = len(wynik)

js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4:
    js += b' '
calosc = 12 + 8 + len(js) + 8 + len(wynik)
with open(cel, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, calosc))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(wynik), 0x004E4942)); f.write(wynik)
print('zapisano', cel, calosc)
