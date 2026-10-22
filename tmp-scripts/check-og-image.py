import struct
data = open("/tmp/og.jpg", "rb").read()
print("size_bytes", len(data))
print("header", data[:3])
# JPEG dimensions are at bytes 16-24 in SOF0 marker
if data[:2] == b"\xff\xd8" and len(data) >= 24:
    # find SOF0 marker
    i = 2
    while i < len(data) - 1:
        if data[i] != 0xff:
            i += 1
            continue
        marker = data[i + 1]
        if marker == 0xd8 or marker == 0xd9:
            break
        if marker >= 0xc0 and marker <= 0xc3:
            h = struct.unpack(">H", data[i + 5:i + 7])[0]
            w = struct.unpack(">H", data[i + 7:i + 9])[0]
            print("dimensions", w, h, "marker", hex(marker))
            break
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        i += 2 + length
else:
    print("not a jpeg")
